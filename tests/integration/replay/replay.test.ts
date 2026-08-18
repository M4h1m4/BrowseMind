import { runReplay } from '../../../src/replay/replay'
import { RunState, Artifact } from '../../../src/types'
import { setupTestDb, teardownTestDb } from '../../helpers/db'

// ─── Mock Playwright ──────────────────────────────────────────────────────────

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          setViewportSize: jest.fn().mockResolvedValue(undefined),
          goto:            jest.fn().mockResolvedValue(undefined),
          waitForTimeout:  jest.fn().mockResolvedValue(undefined),
          url:             jest.fn().mockReturnValue('https://example.com/dashboard'),
          locator: jest.fn().mockReturnValue({
            first:     jest.fn().mockReturnValue({
              boundingBox: jest.fn().mockResolvedValue({ x: 50, y: 100, width: 100, height: 40 })
            }),
            isVisible: jest.fn().mockResolvedValue(true)
          }),
          mouse: {
            click: jest.fn().mockResolvedValue(undefined),
            move:  jest.fn().mockResolvedValue(undefined),
            wheel: jest.fn().mockResolvedValue(undefined)
          },
          keyboard: {
            type:  jest.fn().mockResolvedValue(undefined),
            press: jest.fn().mockResolvedValue(undefined)
          }
        })
      }),
      close: jest.fn().mockResolvedValue(undefined)
    })
  }
}))

// ─── Mock Logger ──────────────────────────────────────────────────────────────

jest.mock('../../../src/agent/logger', () => ({ writeRunLog: jest.fn() }))
import { writeRunLog } from '../../../src/agent/logger'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRunState(): RunState {
  const now = new Date().toISOString()
  return {
    runId:       'replay-run-001',
    type:        'replay',
    status:      'running',
    tenantId:    'tenant-001',
    artifactId:  'artifact-001',
    currentStep: 0,
    isPaused:    false,
    startedAt:   now,
    log: {
      runId:      'replay-run-001',
      type:       'replay',
      artifactId: 'artifact-001',
      tenantId:   'tenant-001',
      goal:       'Test goal',
      startedAt:  now,
      status:     'running',
      steps:      []
    }
  }
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    artifactId:   'artifact-001',
    tenantId:     'tenant-001',
    version:      1,
    goal:         'Test goal',
    targetApp:    'https://example.com',
    createdAt:    new Date().toISOString(),
    allowWrites:  false,
    inputSchema:  {},
    outputSchema: {},
    steps: [
      {
        stepNumber:            1,
        actionType:            'click',
        description:           'Click the login button',
        sensitive:             false,
        elementData: {
          primary:   { type: 'aria-label',   value: 'Login' },
          secondary: { type: 'placeholder',  value: '' },
          tertiary:  { type: 'text-content', value: '' },
          fallback:  { type: 'coordinates',  value: { x: 640, y: 360 } }
        },
        waitAfter:             500,
        maxRetries:            2,
        checkpoint:            { type: 'url-contains', value: '/dashboard' },
        knownOutcomes:         [],
        recoverableConditions: []
      }
    ],
    ...overrides
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setupTestDb()
  jest.clearAllMocks()
})

afterEach(() => {
  teardownTestDb()
})

describe('runReplay', () => {
  it('sets status to success when all steps pass their checkpoints', async () => {
    const state = makeRunState()
    await runReplay(state, makeArtifact(), {})
    expect(state.status).toBe('success')
  })

  it('increments currentStep as steps are executed', async () => {
    const artifact = makeArtifact({
      steps: [
        { ...makeArtifact().steps[0], stepNumber: 1 },
        { ...makeArtifact().steps[0], stepNumber: 2, checkpoint: { type: 'url-contains', value: '/dashboard' } }
      ]
    })
    const state = makeRunState()
    await runReplay(state, artifact, {})
    expect(state.currentStep).toBe(2)
  })

  it('adds a log entry per step', async () => {
    const artifact = makeArtifact({
      steps: [
        { ...makeArtifact().steps[0], stepNumber: 1 },
        { ...makeArtifact().steps[0], stepNumber: 2, checkpoint: { type: 'url-contains', value: '/dashboard' } }
      ]
    })
    const state = makeRunState()
    await runReplay(state, artifact, {})
    expect(state.log.steps).toHaveLength(2)
    expect(state.log.steps[0].status).toBe('success')
    expect(state.log.steps[0].elementStrategyUsed).toBe('primary')
  })

  it('sets status to failed when checkpoint does not pass after retries', async () => {
    const { chromium } = require('playwright')
    const mockPage = await chromium.launch().then((b: any) => b.newContext().then((c: any) => c.newPage()))
    mockPage.url.mockReturnValue('https://example.com/wrong-page')

    const state = makeRunState()
    await runReplay(state, makeArtifact(), {})

    expect(state.status).toBe('failed')
    expect(state.log.error?.observed).toContain('Checkpoint failed')
  })

  it('sets status to failed and records error when an exception is thrown', async () => {
    const { chromium } = require('playwright')
    chromium.launch.mockRejectedValueOnce(new Error('browser crashed'))

    const state = makeRunState()
    await runReplay(state, makeArtifact(), {})

    expect(state.status).toBe('failed')
    expect(state.log.error?.observed).toContain('browser crashed')
  })

  it('writes the run log on completion regardless of outcome', async () => {
    const state = makeRunState()
    await runReplay(state, makeArtifact(), {})
    expect(writeRunLog).toHaveBeenCalledWith(expect.objectContaining({ runId: 'replay-run-001' }))
  })

  it('substitutes {{param}} placeholders in step values from inputs', async () => {
    const { chromium } = require('playwright')
    const mockPage = await chromium.launch().then((b: any) => b.newContext().then((c: any) => c.newPage()))

    const artifact = makeArtifact({
      steps: [{
        ...makeArtifact().steps[0],
        actionType:  'input',
        value:       '{{employeeName}}',
        checkpoint:  { type: 'url-contains', value: '/dashboard' }
      }]
    })

    const state = makeRunState()
    await runReplay(state, artifact, { employeeName: 'John Doe' })

    expect(mockPage.keyboard.type).toHaveBeenCalledWith('John Doe', expect.any(Object))
  })

  it('skips checkpoint verification when checkpoint value is empty placeholder', async () => {
    const artifact = makeArtifact({
      steps: [{
        ...makeArtifact().steps[0],
        checkpoint: { type: 'url-contains', value: '' }  // placeholder
      }]
    })

    const state = makeRunState()
    await runReplay(state, artifact, {})

    // Status should be success — empty checkpoint means no verification needed
    expect(state.status).toBe('success')
  })

  it('handles navigate action without locating an element', async () => {
    const artifact = makeArtifact({
      steps: [{
        ...makeArtifact().steps[0],
        actionType:  'navigate',
        value:       'https://example.com/employees',
        checkpoint:  { type: 'url-contains', value: '/dashboard' }
      }]
    })

    const { chromium } = require('playwright')
    const mockPage = await chromium.launch().then((b: any) => b.newContext().then((c: any) => c.newPage()))

    const state = makeRunState()
    await runReplay(state, artifact, {})

    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com/employees', expect.any(Object))
  })
})
