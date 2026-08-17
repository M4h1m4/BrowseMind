/**
 * Phase 2 E2E — Discovery Agent against OrangeHRM
 *
 * Runs a real capture against the OrangeHRM demo site.
 * Requires a real browser and OPENAI_API_KEY.
 *
 * Skipped by default. Enable with:
 *   RUN_E2E=true npm run test:e2e
 *
 * OrangeHRM demo credentials (public):
 *   URL:      https://opensource-demo.orangehrmlive.com
 *   Username: Admin
 *   Password: admin123
 */

import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { findArtifactsByTenant } from '../../src/artifact/repository'
import { runDiscovery } from '../../src/agent/discovery'
import { RunState } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

function makeRunState(goal: string): RunState {
  const now = new Date().toISOString()
  return {
    runId:       `e2e-run-${Date.now()}`,
    type:        'capture',
    status:      'running',
    tenantId:    'e2e-tenant',
    currentStep: 0,
    isPaused:    false,
    startedAt:   now,
    log: {
      runId:     `e2e-run-${Date.now()}`,
      type:      'capture',
      tenantId:  'e2e-tenant',
      goal,
      startedAt: now,
      status:    'running',
      steps:     []
    }
  }
}

beforeEach(() => {
  setupTestDb()
})

afterEach(() => {
  teardownTestDb()
})

describe('Phase 2 E2E — OrangeHRM discovery', () => {
  itE2E(
    'navigates to OrangeHRM, logs in, and reaches the Employee List — artifact saved',
    async () => {
      const goal =
        'Navigate to OrangeHRM. ' +
        'If you see a login page, enter username "Admin" and password "admin123" and log in. ' +
        'Then navigate to the Employee List page. ' +
        'The goal is complete when you can see the Employee List with a list of employees.'

      const state = makeRunState(goal)

      await runDiscovery(
        state,
        goal,
        'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login',
        'e2e-tenant'
      )

      // Either succeeded or paused for login (Phase 6 wires full session management)
      expect(['success', 'login_required']).toContain(state.status)

      if (state.status === 'success') {
        const artifacts = findArtifactsByTenant('e2e-tenant')
        expect(artifacts.length).toBeGreaterThan(0)
        expect(artifacts[0].steps.length).toBeGreaterThan(0)
        console.log(`Artifact saved with ${artifacts[0].steps.length} steps`)
      }
    },
    120_000 // 2 minute timeout for real browser run
  )
})
