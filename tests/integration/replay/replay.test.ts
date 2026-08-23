import { runReplay } from '../../../src/replay/replay'
import { cancelHandoff, resetHandoffs } from '../../../src/session/handoffSignal'
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
          viewportSize:    jest.fn().mockReturnValue({ width: 1280, height: 720 }),
          locator: jest.fn().mockReturnValue({
            first:     jest.fn().mockReturnValue({
              boundingBox:            jest.fn().mockResolvedValue({ x: 50, y: 100, width: 100, height: 40 }),
              count:                  jest.fn().mockResolvedValue(1),
              scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined),
              click:                  jest.fn().mockResolvedValue(undefined),
              fill:                   jest.fn().mockResolvedValue(undefined)
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
          },
          evaluate: jest.fn().mockResolvedValue(null),
          selectOption: jest.fn().mockResolvedValue(undefined),
          waitForURL:   jest.fn().mockResolvedValue(undefined)
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
    targetApp:      'https://example.com',
    allowedDomains: ['https://example.com'],
    createdAt:      new Date().toISOString(),
    allowWrites:    true,
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
  // Handoff state is module-level and run ids repeat across tests, so a
  // cancellation a run never consumed would otherwise leak into the next one.
  resetHandoffs()
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
    // Checkpoint failures escalate for a human (see c26abd2), so runReplay parks in
    // waitForHandoff and never settles under test. Cancelling up front is consumed
    // the moment the run asks, which is the "no operator available" path — the run
    // fails outright, which is the terminal outcome this test is about.
    cancelHandoff(state.runId)
    await runReplay(state, makeArtifact(), {})

    expect(state.status).toBe('failed')
    // The run-level error is the handoff cancellation, because that is what ended
    // the run. The checkpoint failure that caused the escalation is recorded on the
    // step, which is what this test is really about.
    const failedStep = state.log.steps.find(st => st.status === 'failed')
    expect(failedStep?.errorDetails).toContain('Checkpoint failed')
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
    // Checkpoint failures escalate for a human (see c26abd2), so runReplay parks in
    // waitForHandoff and never settles under test. Cancelling up front is consumed
    // the moment the run asks, which is the "no operator available" path — the run
    // fails outright, which is the terminal outcome this test is about.
    cancelHandoff(state.runId)
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

    // Text entry goes through the locator, which auto-scrolls and throws if the
    // field is not editable — mouse.click + keyboard.type could miss silently.
    const field = mockPage.locator().first()
    expect(field.fill).toHaveBeenCalledWith('John Doe', expect.any(Object))
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
    // The mock page reports /dashboard, so this navigate's checkpoint fails and the
    // step escalates rather than ending the run. Cancelling up front stands in for
    // "no operator available", so the assertion below is reachable.
    cancelHandoff(state.runId)
    await runReplay(state, artifact, {})

    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com/employees', expect.any(Object))
  })
})
