/**
 * Phase 6 E2E — Session Management
 *
 * Two test categories:
 *
 * 1. AUTOMATED — programmatically log in via a separate Playwright browser,
 *    store the resulting auth state, then run a replay that injects it and
 *    skips the login page entirely.
 *
 * 2. MANUAL — capture run that pauses at login_required. Requires a human to
 *    log in within the LOGIN_WAIT_MS window.
 *
 * Run all:          RUN_E2E=true npm run test:e2e
 * Automated only:   RUN_E2E=true npm run test:e2e -- --testNamePattern="automated"
 * Manual only:      RUN_E2E=true LOGIN_WAIT_MS=30000 npm run test:e2e -- --testNamePattern="manual"
 */

import 'dotenv/config'
import { chromium } from 'playwright'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { storeAuthState, getAuthState, clearAllAuthState } from '../../src/session/authStore'
import { signalResume, resetSignals } from '../../src/session/resumeSignal'
import { runDiscovery } from '../../src/agent/discovery'
import { runReplay } from '../../src/replay/replay'
import { RunState, Artifact } from '../../src/types'

const RUN_E2E      = process.env.RUN_E2E === 'true'
const itE2E        = RUN_E2E ? it : it.skip
const LOGIN_WAIT_MS = parseInt(process.env.LOGIN_WAIT_MS ?? '30000')

const TARGET      = 'https://opensource-demo.orangehrmlive.com'
const LOGIN_URL   = `${TARGET}/web/index.php/auth/login`
const DOMAIN      = 'opensource-demo.orangehrmlive.com'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDiscoveryState(runId = `e2e-session-${Date.now()}`): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'capture', status: 'running', tenantId: 'e2e-tenant',
    currentStep: 0, isPaused: false, startedAt: now,
    log: { runId, type: 'capture', tenantId: 'e2e-tenant', goal: 'Navigate to employee list',
           startedAt: now, status: 'running', steps: [] }
  }
}

function makeReplayState(runId = `e2e-replay-${Date.now()}`): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'replay', status: 'running', tenantId: 'e2e-tenant',
    artifactId: 'e2e-fixture', currentStep: 0, isPaused: false, startedAt: now,
    log: { runId, type: 'replay', artifactId: 'e2e-fixture', tenantId: 'e2e-tenant',
           goal: 'Wait on dashboard', startedAt: now, status: 'running', steps: [] }
  }
}

// Simple artifact: wait 1 second on whatever page we land on after auth injection
function makeWaitArtifact(): Artifact {
  return {
    artifactId: 'e2e-fixture', tenantId: 'e2e-tenant', version: 1,
    goal: 'Wait on dashboard', targetApp: LOGIN_URL,
    createdAt: new Date().toISOString(), allowWrites: false,
    inputSchema: {}, outputSchema: {},
    steps: [{
      stepNumber: 1, actionType: 'wait', description: 'Wait for page to load',
      sensitive: false,
      elementData: {
        primary:   { type: 'aria-label',   value: '' },
        secondary: { type: 'placeholder',  value: '' },
        tertiary:  { type: 'text-content', value: '' },
        fallback:  { type: 'coordinates',  value: { x: 640, y: 360 } }
      },
      waitAfter: 1000, maxRetries: 0,
      // Checkpoint: verify we are NOT on the login page (i.e. auth worked)
      checkpoint: { type: 'url-contains', value: '/dashboard' },
      knownOutcomes: [], recoverableConditions: []
    }]
  }
}

/**
 * Log in to OrangeHRM in a headless browser and return the captured auth state.
 * Used by the automated tests only.
 */
async function programmaticLogin() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page    = await context.newPage()

  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' })
  await page.fill('input[name="username"]', 'Admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(4000)  // wait for SPA redirect to dashboard

  const cookies      = await context.cookies()
  const localStorage = await page.evaluate<Record<string, string>>(() => {
    const result: Record<string, string> = {}
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key) result[key] = window.localStorage.getItem(key) ?? ''
    }
    return result
  })

  await browser.close()
  return { cookies, localStorage }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  setupTestDb()
  resetSignals()
  clearAllAuthState()
})

afterEach(() => {
  teardownTestDb()
})

// ─── Automated tests (no human needed) ───────────────────────────────────────

describe('Phase 6 E2E — automated (programmatic login)', () => {
  itE2E(
    'programmatic login captures valid cookies and localStorage',
    async () => {
      const { cookies, localStorage } = await programmaticLogin()

      console.log(`\n[e2e] Cookies captured: ${cookies.length}`)
      console.log(`[e2e] localStorage keys: ${Object.keys(localStorage).join(', ')}`)

      expect(cookies.length).toBeGreaterThan(0)
    },
    60_000
  )

  itE2E(
    'replay injects stored auth state and lands on dashboard (skips login)',
    async () => {
      // Step 1: get valid cookies from a headless login
      const { cookies, localStorage } = await programmaticLogin()

      // Step 2: store in authStore (simulates what captureAndStoreAuthState does)
      storeAuthState(DOMAIN, {
        domain:       DOMAIN,
        cookies,
        localStorage,
        capturedAt:   new Date().toISOString()
      })

      console.log(`\n[e2e] Auth state stored — ${cookies.length} cookies`)

      // Step 3: run a replay — it should inject the cookies and go straight to dashboard
      const state = makeReplayState()
      await runReplay(state, makeWaitArtifact(), {})

      console.log(`[e2e] Replay status: ${state.status}`)
      if (state.log.error) console.log(`[e2e] Error: ${state.log.error.observed}`)

      expect(state.status).toBe('success')
    },
    120_000
  )

  itE2E(
    'replay without stored auth fails checkpoint (no session — lands on login page)',
    async () => {
      // No auth state stored — replay should navigate to login page, fail checkpoint

      const state = makeReplayState()
      await runReplay(state, makeWaitArtifact(), {})

      console.log(`\n[e2e] Replay status without auth: ${state.status}`)

      // Without valid session, the checkpoint /dashboard will fail
      expect(state.status).toBe('failed')
    },
    60_000
  )
})

// ─── Manual test (requires human login) ──────────────────────────────────────

describe('Phase 6 E2E — manual (human logs in)', () => {
  itE2E(
    `[manual] capture pauses at login_required — log in within ${LOGIN_WAIT_MS / 1000}s then resume fires automatically`,
    async () => {
      const state = makeDiscoveryState()

      console.log(`
┌─────────────────────────────────────────────────────────────┐
│  Browser opening → log in with Admin / admin123             │
│  You have ${LOGIN_WAIT_MS / 1000} seconds. Then resume fires automatically.   │
└─────────────────────────────────────────────────────────────┘`)

      const timer = setTimeout(() => {
        console.log(`\n[e2e] Firing resume signal for run ${state.runId}`)
        signalResume(state.runId)
      }, LOGIN_WAIT_MS)

      await runDiscovery(state, 'Navigate to employee list', LOGIN_URL, 'e2e-tenant')

      clearTimeout(timer)

      const auth = getAuthState(DOMAIN)
      console.log(`\n[e2e] Final status: ${state.status}`)
      console.log(`[e2e] Auth state captured: ${auth ? `${auth.cookies.length} cookies` : 'none'}`)

      // After a real login the auth state should be captured
      expect(auth).toBeDefined()
      expect(auth?.cookies.length).toBeGreaterThanOrEqual(1)
    },
    300_000
  )
})
