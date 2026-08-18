import { runReplay } from '../../../src/replay/replay'
import { RunState, Artifact } from '../../../src/types'
import { setupTestDb, teardownTestDb } from '../../helpers/db'

// ─── Mock Playwright ──────────────────────────────────────────────────────────

let mockPageUrl = 'https://example.com/dashboard'

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          setViewportSize: jest.fn().mockResolvedValue(undefined),
          goto:            jest.fn().mockResolvedValue(undefined),
          waitForTimeout:  jest.fn().mockResolvedValue(undefined),
          url:             jest.fn().mockImplementation(() => mockPageUrl),
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

jest.mock('../../../src/agent/logger', () => ({ writeRunLog: jest.fn() }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRunState(): RunState {
  const now = new Date().toISOString()
  return {
    runId: 'guardrail-run-001', type: 'replay', status: 'running',
    tenantId: 'tenant-001', artifactId: 'artifact-001', currentStep: 0,
    isPaused: false, startedAt: now,
    log: {
      runId: 'guardrail-run-001', type: 'replay', artifactId: 'artifact-001',
      tenantId: 'tenant-001', goal: 'Test', startedAt: now, status: 'running', steps: []
    }
  }
}

function makeStep(overrides = {}) {
  return {
    stepNumber: 1, actionType: 'click' as const, description: 'Click submit',
    sensitive: false,
    elementData: {
      primary:   { type: 'aria-label',   value: 'Submit' },
      secondary: { type: 'placeholder',  value: '' },
      tertiary:  { type: 'text-content', value: '' },
      fallback:  { type: 'coordinates' as const, value: { x: 100, y: 200 } }
    },
    waitAfter: 500, maxRetries: 1,
    checkpoint: { type: 'url-contains' as const, value: '/dashboard' },
    knownOutcomes: [], recoverableConditions: [],
    ...overrides
  }
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    artifactId: 'artifact-001', tenantId: 'tenant-001', version: 1,
    goal: 'Test', targetApp: 'https://example.com', createdAt: new Date().toISOString(),
    allowWrites: true, inputSchema: {}, outputSchema: {},
    steps: [makeStep()],
    ...overrides
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setupTestDb()
  jest.clearAllMocks()
  mockPageUrl = 'https://example.com/dashboard'
})

afterEach(() => {
  teardownTestDb()
})

describe('Guardrails — allowWrites enforcement', () => {
  it('allows write actions when allowWrites is true', async () => {
    const state = makeRunState()
    await runReplay(state, makeArtifact({ allowWrites: true }), {})
    expect(state.status).toBe('success')
  })

  it('blocks write action and sets status to failed when allowWrites is false', async () => {
    const state = makeRunState()
    await runReplay(state, makeArtifact({ allowWrites: false }), {})

    expect(state.status).toBe('failed')
    expect(state.log.error?.observed).toContain('write action')
    expect(state.log.error?.observed).toContain('blocked')
  })

  it('allows read-only actions when allowWrites is false', async () => {
    const artifact = makeArtifact({
      allowWrites: false,
      steps: [makeStep({ actionType: 'wait', description: 'Wait for page' })]
    })
    const state = makeRunState()
    await runReplay(state, artifact, {})
    expect(state.status).toBe('success')
  })

  it('records which step was blocked in the error log', async () => {
    const artifact = makeArtifact({
      allowWrites: false,
      steps: [
        makeStep({ stepNumber: 1, actionType: 'wait', description: 'Wait', checkpoint: { type: 'url-contains' as const, value: '' } }),
        makeStep({ stepNumber: 2, actionType: 'input', description: 'Enter name' })
      ]
    })
    const state = makeRunState()
    await runReplay(state, artifact, {})

    expect(state.status).toBe('failed')
    expect(state.log.error?.step).toBe(2)
  })
})

describe('Guardrails — destructive action escalation', () => {
  it('sets status to confirmation_required for destructive actions', async () => {
    const artifact = makeArtifact({
      steps: [makeStep({ description: 'Click Delete employee button' })]
    })
    const state = makeRunState()
    await runReplay(state, artifact, {})

    expect(state.status).toBe('confirmation_required')
    expect(state.isPaused).toBe(true)
  })

  it('stops replay at the destructive step without executing it', async () => {
    const { chromium } = require('playwright')
    const mockPage = await chromium.launch().then((b: any) => b.newContext().then((c: any) => c.newPage()))

    const artifact = makeArtifact({
      steps: [makeStep({ description: 'Click Delete employee button' })]
    })
    const state = makeRunState()
    await runReplay(state, artifact, {})

    expect(mockPage.mouse.click).not.toHaveBeenCalled()
  })
})

describe('Guardrails — domain allowlist', () => {
  it('blocks navigate action targeting an external domain', async () => {
    const artifact = makeArtifact({
      steps: [makeStep({
        actionType:  'navigate',
        description: 'Navigate to next page',
        value:       'https://external-site.com/steal'
      })]
    })
    const state = makeRunState()
    await runReplay(state, artifact, {})

    expect(state.status).toBe('failed')
    expect(state.log.error?.observed).toContain('external domain blocked')
  })

  it('allows navigate action within the same domain', async () => {
    const artifact = makeArtifact({
      steps: [makeStep({
        actionType:  'navigate',
        description: 'Navigate to employees page',
        value:       'https://example.com/employees',
        checkpoint:  { type: 'url-contains' as const, value: '/dashboard' }
      })]
    })
    const state = makeRunState()
    await runReplay(state, artifact, {})

    expect(state.status).toBe('success')
  })

  it('blocks run when page redirects to an external domain after an action', async () => {
    mockPageUrl = 'https://evil.com/phished'

    const state = makeRunState()
    await runReplay(state, makeArtifact(), {})

    expect(state.status).toBe('failed')
    expect(state.log.error?.observed).toContain('outside allowed domain')
  })

  it('allows run when page stays within the allowed domain', async () => {
    mockPageUrl = 'https://example.com/dashboard'
    const state = makeRunState()
    await runReplay(state, makeArtifact(), {})
    expect(state.status).toBe('success')
  })
})
