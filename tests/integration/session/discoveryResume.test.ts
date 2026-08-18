/**
 * Discovery loop — session management integration tests
 *
 * Verifies that when the LLM returns requiresLogin = true the discovery loop:
 *   1. Sets status to login_required and isPaused to true
 *   2. Waits for signalResume to be called (no credentials)
 *   3. Calls captureAndStoreAuthState after human logs in
 *   4. Continues the loop (does not exit early)
 *   5. Stores auth state so replay can inject it later
 */

import { runDiscovery } from '../../../src/agent/discovery'
import { RunState } from '../../../src/types'
import { setupTestDb, teardownTestDb } from '../../helpers/db'
import { signalResume, resetSignals } from '../../../src/session/resumeSignal'
import { getAuthState, clearAllAuthState } from '../../../src/session/authStore'

// ─── Mock OpenAI — prevents "OPENAI_API_KEY missing" at default-param init ───

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({}))
}))
import OpenAI from 'openai'
const mockClient = new OpenAI()

// ─── Mock Playwright ──────────────────────────────────────────────────────────
// All objects must be defined inside the factory to avoid hoisting errors.

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          setViewportSize:  jest.fn().mockResolvedValue(undefined),
          goto:             jest.fn().mockResolvedValue(undefined),
          screenshot:       jest.fn().mockResolvedValue(Buffer.from('fake-image')),
          waitForTimeout:   jest.fn().mockResolvedValue(undefined),
          locator: jest.fn().mockReturnValue({
            first: jest.fn().mockReturnValue({
              isVisible: jest.fn().mockResolvedValue(true),
              click:     jest.fn().mockResolvedValue(undefined),
              fill:      jest.fn().mockResolvedValue(undefined)
            }),
            isVisible: jest.fn().mockResolvedValue(true)
          }),
          mouse: {
            click: jest.fn().mockResolvedValue(undefined),
            move:  jest.fn().mockResolvedValue(undefined),
            wheel: jest.fn().mockResolvedValue(undefined)
          },
          keyboard: {
            press: jest.fn().mockResolvedValue(undefined),
            type:  jest.fn().mockResolvedValue(undefined)
          },
          evaluate: jest.fn().mockResolvedValue({ authToken: 'captured-token' }),
          url: jest.fn().mockReturnValue('https://example.com/dashboard')
        }),
        cookies:       jest.fn().mockResolvedValue([
          {
            name: 'session', value: 'abc', domain: 'example.com',
            path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax'
          }
        ]),
        addCookies:    jest.fn().mockResolvedValue(undefined),
        addInitScript: jest.fn().mockResolvedValue(undefined)
      }),
      close: jest.fn().mockResolvedValue(undefined)
    })
  }
}))

// ─── Mock logger ──────────────────────────────────────────────────────────────

jest.mock('../../../src/agent/logger', () => ({ writeRunLog: jest.fn() }))

// ─── Mock LLM ────────────────────────────────────────────────────────────────

jest.mock('../../../src/agent/llm', () => ({
  callLLM: jest.fn()
}))
import { callLLM } from '../../../src/agent/llm'

// ─── Mock artifact persistence ────────────────────────────────────────────────

jest.mock('../../../src/artifact/repository', () => ({
  saveArtifact:        jest.fn(),
  generateArtifactId:  jest.fn().mockReturnValue('artifact-mock-001')
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseAction = {
  checkpointForPreviousStep: null,
  action:            'click' as const,
  coordinates:       { x: 100, y: 200 },
  targetDescription: 'Some button',
  value:             null,
  reasoning:         'test',
  requiresLogin:     false,
  goalComplete:      false,
  updatedSummary:    'clicked'
}

function makeRunState(): RunState {
  const now = new Date().toISOString()
  return {
    runId:       'disc-session-001',
    type:        'capture',
    status:      'running',
    tenantId:    'tenant-001',
    currentStep: 0,
    isPaused:    false,
    startedAt:   now,
    log: {
      runId:    'disc-session-001',
      type:     'capture',
      tenantId: 'tenant-001',
      goal:     'Test',
      startedAt: now,
      status:   'running',
      steps:    []
    }
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setupTestDb()
  resetSignals()
  clearAllAuthState()
  jest.clearAllMocks()
})

afterEach(() => {
  teardownTestDb()
})

describe('runDiscovery — login_required + resume', () => {
  it('pauses on login_required and resumes after credentials are delivered', async () => {
    const callLLMMock = callLLM as jest.MockedFunction<typeof callLLM>

    callLLMMock
      .mockResolvedValueOnce({ ...baseAction, requiresLogin: true, updatedSummary: 'need login' })
      .mockResolvedValueOnce({ ...baseAction, goalComplete: true,  updatedSummary: 'done' })

    const state = makeRunState()

    setTimeout(() => {
      signalResume('disc-session-001')
    }, 20)

    await runDiscovery(state, 'Test goal', 'https://example.com', 'tenant-001', mockClient)

    expect(state.status).toBe('success')
  })

  it('stores auth state after successful login', async () => {
    const callLLMMock = callLLM as jest.MockedFunction<typeof callLLM>

    callLLMMock
      .mockResolvedValueOnce({ ...baseAction, requiresLogin: true, updatedSummary: 'need login' })
      .mockResolvedValueOnce({ ...baseAction, goalComplete: true,  updatedSummary: 'done' })

    const state = makeRunState()

    setTimeout(() => {
      signalResume('disc-session-001')
    }, 20)

    await runDiscovery(state, 'Test goal', 'https://example.com', 'tenant-001', mockClient)

    const auth = getAuthState('example.com')
    expect(auth).toBeDefined()
    expect(auth?.localStorage).toEqual({ authToken: 'captured-token' })
  })

  it('transitions: running → login_required (while paused) → success after resume', async () => {
    const callLLMMock = callLLM as jest.MockedFunction<typeof callLLM>
    let statusWhilePaused = ''

    callLLMMock
      .mockResolvedValueOnce({ ...baseAction, requiresLogin: true, updatedSummary: 'need login' })
      .mockResolvedValueOnce({ ...baseAction, goalComplete: true,  updatedSummary: 'done' })

    const state = makeRunState()

    setTimeout(() => {
      statusWhilePaused = state.status  // should be login_required at this point
      signalResume('disc-session-001')
    }, 20)

    await runDiscovery(state, 'Goal', 'https://example.com', 'tenant-001')

    expect(statusWhilePaused).toBe('login_required')
    expect(state.status).toBe('success')
  })
})
