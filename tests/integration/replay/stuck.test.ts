import { runReplay } from '../../../src/replay/replay'
import { RunState, Artifact } from '../../../src/types'
import { setupTestDb, teardownTestDb } from '../../helpers/db'
import { signalHandoff, cancelHandoff, resetHandoffs } from '../../../src/session/handoffSignal'

// ─── Mock Playwright ──────────────────────────────────────────────────────────

const mockGoto           = jest.fn().mockResolvedValue(undefined)
const mockWaitForTimeout = jest.fn().mockResolvedValue(undefined)
const mockUrl            = jest.fn().mockReturnValue('https://example.com/dashboard')
const mockMouseClick     = jest.fn().mockResolvedValue(undefined)
const mockMouseMove      = jest.fn().mockResolvedValue(undefined)
const mockMouseWheel     = jest.fn().mockResolvedValue(undefined)
const mockKeyboardType   = jest.fn().mockResolvedValue(undefined)
const mockKeyboardPress  = jest.fn().mockResolvedValue(undefined)
const mockScreenshot     = jest.fn().mockResolvedValue(undefined)
const mockIsVisible      = jest.fn().mockResolvedValue(true)

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockImplementation(() =>
      Promise.resolve({
        newContext: jest.fn().mockImplementation(() =>
          Promise.resolve({
            newPage: jest.fn().mockImplementation(() =>
              Promise.resolve({
                setViewportSize: jest.fn().mockResolvedValue(undefined),
                goto:            mockGoto,
                waitForTimeout:  mockWaitForTimeout,
                url:             mockUrl,
                locator: jest.fn().mockImplementation(() => ({
                  first: jest.fn().mockReturnValue({
                    boundingBox: jest.fn().mockResolvedValue({ x: 50, y: 100, width: 100, height: 40 })
                  }),
                  isVisible: mockIsVisible
                })),
                mouse: {
                  click: mockMouseClick,
                  move:  mockMouseMove,
                  wheel: mockMouseWheel
                },
                keyboard: {
                  type:  mockKeyboardType,
                  press: mockKeyboardPress
                },
                screenshot: mockScreenshot
              })
            ),
            addCookies:    jest.fn().mockResolvedValue(undefined),
            addInitScript: jest.fn().mockResolvedValue(undefined)
          })
        ),
        close: jest.fn().mockResolvedValue(undefined)
      })
    )
  }
}))

// ─── Mock elementLocator — controls whether element is "found" ───────────────

const mockLocateElement = jest.fn()
jest.mock('../../../src/replay/elementLocator', () => ({
  locateElement: (...args: unknown[]) => mockLocateElement(...args)
}))

// ─── Mock Logger ──────────────────────────────────────────────────────────────

jest.mock('../../../src/agent/logger', () => ({ writeRunLog: jest.fn() }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOCATE_SUCCESS = { strategy: 'primary' as const, x: 50, y: 100 }
const LOCATE_FAIL    = new Error('Could not locate element: Submit')

function makeRunState(runId = 'stuck-run-001'): RunState {
  const now = new Date().toISOString()
  return {
    runId,
    type:        'replay',
    status:      'running',
    tenantId:    'tenant-001',
    artifactId:  'artifact-001',
    currentStep: 0,
    isPaused:    false,
    startedAt:   now,
    log: {
      runId,
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
    allowWrites:  true,
    inputSchema:  {},
    outputSchema: {},
    steps: [
      {
        stepNumber:            1,
        actionType:            'click',
        description:           'Click the submit button',
        sensitive:             false,
        elementData: {
          primary:   { type: 'aria-label',   value: 'Submit' },
          secondary: { type: 'placeholder',  value: '' },
          tertiary:  { type: 'text-content', value: '' },
          fallback:  { type: 'coordinates',  value: { x: 640, y: 360 } }
        },
        waitAfter:             500,
        maxRetries:            1,
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
  resetHandoffs()
  // Restore stable mocks that clearAllMocks wiped
  mockGoto.mockResolvedValue(undefined)
  mockWaitForTimeout.mockResolvedValue(undefined)
  mockUrl.mockReturnValue('https://example.com/dashboard')
  mockMouseClick.mockResolvedValue(undefined)
  mockMouseMove.mockResolvedValue(undefined)
  mockMouseWheel.mockResolvedValue(undefined)
  mockKeyboardType.mockResolvedValue(undefined)
  mockKeyboardPress.mockResolvedValue(undefined)
  mockScreenshot.mockResolvedValue(undefined)
  mockIsVisible.mockResolvedValue(true)
  // Default: element not found — triggers stuck path
  mockLocateElement.mockRejectedValue(LOCATE_FAIL)
})

afterEach(() => {
  teardownTestDb()
  resetHandoffs()
})

describe('stuck detection and handoff flow', () => {
  it('sets status to stuck when element cannot be located after all retries', async () => {
    const state = makeRunState()

    // Cancel the handoff after a short delay to avoid the test hanging
    setTimeout(() => cancelHandoff(state.runId), 50)

    await runReplay(state, makeArtifact(), {})

    // Cancelled handoff transitions to failed
    expect(state.status).toBe('failed')
    expect(state.log.error?.observed).toContain('handoff cancelled')
  })

  it('resumes after signalHandoff is called and retries the step', async () => {
    const state = makeRunState('stuck-run-002')

    // After signal, make element locatable so the retry succeeds
    setTimeout(() => {
      mockLocateElement.mockResolvedValue(LOCATE_SUCCESS)
      signalHandoff(state.runId, 'I fixed the page layout')
    }, 50)

    await runReplay(state, makeArtifact(), {})

    expect(state.status).toBe('success')
    // The stuck step log entry should carry humanNotes
    const stuckEntry = state.log.steps.find(s => s.status === 'stuck')
    expect(stuckEntry).toBeDefined()
    expect(stuckEntry?.humanNotes).toBe('I fixed the page layout')
  })

  it('sets status to failed when step still fails after human handoff', async () => {
    const state = makeRunState('stuck-run-003')

    // Element stays un-locatable even after handoff — retry also fails
    setTimeout(() => {
      signalHandoff(state.runId, 'tried but could not fix it')
    }, 50)

    await runReplay(state, makeArtifact(), {})

    expect(state.status).toBe('failed')
    expect(state.log.error?.expected).toContain('checkpoint after human handoff')
  })

  it('allows read-only steps (wait/navigate) to pass through without stuck detection', async () => {
    const artifact = makeArtifact({
      steps: [
        {
          stepNumber:            1,
          actionType:            'wait',
          description:           'Wait for page load',
          sensitive:             false,
          elementData: {
            primary:   { type: 'aria-label',   value: '' },
            secondary: { type: 'placeholder',  value: '' },
            tertiary:  { type: 'text-content', value: '' },
            fallback:  { type: 'coordinates',  value: { x: 0, y: 0 } }
          },
          waitAfter:             0,
          maxRetries:            1,
          checkpoint:            { type: 'url-contains', value: '' },
          knownOutcomes:         [],
          recoverableConditions: []
        }
      ]
    })

    const state = makeRunState('stuck-run-004')
    await runReplay(state, artifact, {})

    // wait step should succeed without needing element locator
    expect(state.status).toBe('success')
    expect(state.log.steps[0].status).toBe('success')
  })

  it('handles recoverable condition — dismiss — by pressing Escape before retry', async () => {
    const artifact = makeArtifact({
      steps: [
        {
          stepNumber:            1,
          actionType:            'click',
          description:           'Click submit with modal present',
          sensitive:             false,
          elementData: {
            primary:   { type: 'aria-label',   value: 'Submit' },
            secondary: { type: 'placeholder',  value: '' },
            tertiary:  { type: 'text-content', value: '' },
            fallback:  { type: 'coordinates',  value: { x: 640, y: 360 } }
          },
          waitAfter:             0,
          maxRetries:            2,
          checkpoint:            { type: 'url-contains', value: '/dashboard' },
          knownOutcomes:         [],
          recoverableConditions: [
            { pattern: 'modal', action: 'dismiss' }
          ]
        }
      ]
    })

    // First two attempts throw an error containing 'modal' (recoverable),
    // third attempt succeeds — note: maxRetries=2 means attempts 0,1,2
    let callCount = 0
    mockLocateElement.mockImplementation(async () => {
      callCount++
      if (callCount <= 2) throw new Error('modal overlay detected')
      return LOCATE_SUCCESS
    })

    const state = makeRunState('stuck-run-005')
    await runReplay(state, artifact, {})

    expect(state.status).toBe('success')
    // Escape should have been pressed for the recoverable condition
    expect(mockKeyboardPress).toHaveBeenCalledWith('Escape')
  })
})
