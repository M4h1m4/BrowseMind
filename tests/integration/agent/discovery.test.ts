import { runDiscovery } from '../../../src/agent/discovery'
import { RunState } from '../../../src/types'
import { setupTestDb, teardownTestDb } from '../../helpers/db'
import { findArtifactsByTenant } from '../../../src/artifact/repository'

// ─── Mock Playwright ──────────────────────────────────────────────────────────
// jest.mock is hoisted — define everything inside the factory to avoid
// "Cannot access before initialization" errors with outer variables.

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          setViewportSize: jest.fn().mockResolvedValue(undefined),
          goto:            jest.fn().mockResolvedValue(undefined),
          screenshot:      jest.fn().mockResolvedValue(Buffer.from('fake-png')),
          waitForTimeout:  jest.fn().mockResolvedValue(undefined),
          mouse: {
            click: jest.fn().mockResolvedValue(undefined),
            move:  jest.fn().mockResolvedValue(undefined),
            wheel: jest.fn().mockResolvedValue(undefined)
          },
          keyboard: {
            type:  jest.fn().mockResolvedValue(undefined),
            press: jest.fn().mockResolvedValue(undefined)
          },
          evaluate: jest.fn().mockResolvedValue({
            ariaLabel:   'Test Label',
            placeholder: '',
            textContent: 'Test'
          })
        })
      }),
      close: jest.fn().mockResolvedValue(undefined)
    })
  }
}))

// ─── Mock OpenAI SDK — prevents async credential loading after test teardown

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({}))
}))

import OpenAI from 'openai'
const mockClient = new OpenAI()

// ─── Mock LLM ────────────────────────────────────────────────────────────────

jest.mock('../../../src/agent/llm')
import { callLLM } from '../../../src/agent/llm'
const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>

// ─── Mock Logger ──────────────────────────────────────────────────────────────

jest.mock('../../../src/agent/logger', () => ({ writeRunLog: jest.fn() }))
import { writeRunLog } from '../../../src/agent/logger'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRunState(): RunState {
  const now = new Date().toISOString()
  return {
    runId:       'run-001',
    type:        'capture',
    status:      'running',
    tenantId:    'tenant-001',
    currentStep: 0,
    isPaused:    false,
    startedAt:   now,
    log: {
      runId:     'run-001',
      type:      'capture',
      tenantId:  'tenant-001',
      goal:      'Test goal',
      startedAt: now,
      status:    'running',
      steps:     []
    }
  }
}

const clickAction = {
  checkpointForPreviousStep: null,
  action:            'click' as const,
  coordinates:       { x: 100, y: 200 },
  targetDescription: 'Test button',
  value:             null,
  reasoning:         'Click to proceed',
  requiresLogin:     false,
  goalComplete:      false,
  updatedSummary:    'Clicked test button'
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setupTestDb()
  jest.clearAllMocks()
})

afterEach(() => {
  teardownTestDb()
})

describe('runDiscovery', () => {
  it('sets status to success when LLM signals goalComplete', async () => {
    mockCallLLM
      .mockResolvedValueOnce({ ...clickAction })
      .mockResolvedValueOnce({
        ...clickAction,
        goalComplete:              true,
        checkpointForPreviousStep: { type: 'url-contains' as const, value: '/home' },
        updatedSummary:            'Done'
      })

    const state = makeRunState()
    await runDiscovery(state, 'Test goal', 'https://example.com', 'tenant-001', mockClient)

    expect(state.status).toBe('success')
    expect(state.artifactId).toBeDefined()
  })

  it('saves artifact to database on success', async () => {
    mockCallLLM
      .mockResolvedValueOnce({ ...clickAction })
      .mockResolvedValueOnce({
        ...clickAction,
        goalComplete:              true,
        checkpointForPreviousStep: { type: 'url-contains' as const, value: '/done' },
        updatedSummary:            'Done'
      })

    const state = makeRunState()
    await runDiscovery(state, 'Test goal', 'https://example.com', 'tenant-001', mockClient)

    const artifacts = findArtifactsByTenant('tenant-001')
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].goal).toBe('Test goal')
    expect(artifacts[0].steps).toHaveLength(2)
  })

  it('pauses and sets login_required when LLM signals requiresLogin', async () => {
    mockCallLLM.mockResolvedValueOnce({ ...clickAction, requiresLogin: true })

    const state = makeRunState()
    await runDiscovery(state, 'Test goal', 'https://example.com', 'tenant-001', mockClient)

    expect(state.status).toBe('login_required')
    expect(state.isPaused).toBe(true)
  })

  it('sets status to failed and records error when an exception is thrown', async () => {
    mockCallLLM.mockRejectedValueOnce(new Error('LLM API unavailable'))

    const state = makeRunState()
    await runDiscovery(state, 'Test goal', 'https://example.com', 'tenant-001', mockClient)

    expect(state.status).toBe('failed')
    expect(state.log.error?.observed).toContain('LLM API unavailable')
  })

  it('writes the run log on completion regardless of outcome', async () => {
    mockCallLLM.mockResolvedValueOnce({
      ...clickAction,
      goalComplete:              true,
      checkpointForPreviousStep: null,
      updatedSummary:            'Done'
    })

    const state = makeRunState()
    await runDiscovery(state, 'Test goal', 'https://example.com', 'tenant-001', mockClient)

    expect(writeRunLog).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-001' })
    )
  })

  it('updates currentStep as the loop progresses', async () => {
    mockCallLLM
      .mockResolvedValueOnce({ ...clickAction })
      .mockResolvedValueOnce({ ...clickAction })
      .mockResolvedValueOnce({
        ...clickAction,
        goalComplete:              true,
        checkpointForPreviousStep: { type: 'text-present' as const, value: 'Done' },
        updatedSummary:            'Done'
      })

    const state = makeRunState()
    await runDiscovery(state, 'Test goal', 'https://example.com', 'tenant-001', mockClient)

    expect(state.currentStep).toBe(3)
  })
})
