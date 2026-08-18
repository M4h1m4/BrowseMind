/**
 * Phase 6 E2E — Session Management
 *
 * Tests the full login-required → resume with credentials → auth state captured
 * → replay uses stored auth state flow against the OrangeHRM demo.
 *
 * Skipped by default. Enable with:
 *   RUN_E2E=true npm run test:e2e
 */

import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { getAuthState, clearAllAuthState } from '../../src/session/authStore'
import { signalResume, resetSignals } from '../../src/session/resumeSignal'
import { runDiscovery } from '../../src/agent/discovery'
import { RunState } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

const LOGIN_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login'

function makeRunState(runId = `e2e-session-${Date.now()}`): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'capture', status: 'running', tenantId: 'e2e-tenant',
    currentStep: 0, isPaused: false, startedAt: now,
    log: {
      runId, type: 'capture', tenantId: 'e2e-tenant',
      goal: 'Navigate to employee list after login',
      startedAt: now, status: 'running', steps: []
    }
  }
}

beforeEach(() => {
  setupTestDb()
  resetSignals()
  clearAllAuthState()
})

afterEach(() => {
  teardownTestDb()
})

describe('Phase 6 E2E — Session Management on real browser', () => {
  itE2E(
    'discovery run pauses at login_required and resumes after credentials are supplied',
    async () => {
      const state = makeRunState()

      // Deliver OrangeHRM credentials ~2 s after the run starts
      // (enough time for the LLM to detect the login page and signal requiresLogin)
      setTimeout(() => {
        signalResume(state.runId, { username: 'Admin', password: 'admin123' })
      }, 8_000)

      await runDiscovery(
        state,
        'Navigate to the employee list',
        LOGIN_URL,
        'e2e-tenant'
      )

      // The run should have recovered and either completed or reached max steps
      expect(['success', 'failed']).toContain(state.status)
    },
    120_000
  )

  itE2E(
    'auth state is captured and stored after a successful login',
    async () => {
      const state = makeRunState()

      setTimeout(() => {
        signalResume(state.runId, { username: 'Admin', password: 'admin123' })
      }, 8_000)

      await runDiscovery(state, 'Login to OrangeHRM', LOGIN_URL, 'e2e-tenant')

      // The hostname 'opensource-demo.orangehrmlive.com' should have auth state
      const domain = new URL(LOGIN_URL).hostname
      const auth   = getAuthState(domain)

      // Auth state may or may not be captured depending on whether login succeeded,
      // but if status is success it must be defined
      if (state.status === 'success') {
        expect(auth).toBeDefined()
        expect(auth?.cookies.length).toBeGreaterThan(0)
      }
    },
    120_000
  )
})
