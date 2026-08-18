/**
 * Phase 3 E2E — Replay Engine against OrangeHRM
 *
 * Replays a fixture artifact against the OrangeHRM demo login page.
 * No credentials needed — the artifact only navigates to the login page
 * and verifies the URL, which is publicly accessible.
 *
 * Skipped by default. Enable with:
 *   RUN_E2E=true npm run test:e2e
 */

import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { runReplay } from '../../src/replay/replay'
import { RunState, Artifact } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

const LOGIN_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login'

// Fixture artifact — navigates to the login page and verifies the URL
const loginPageArtifact: Artifact = {
  artifactId:   'e2e-replay-fixture',
  tenantId:     'e2e-tenant',
  version:      1,
  goal:         'Verify OrangeHRM login page loads',
  targetApp:    LOGIN_URL,
  createdAt:    new Date().toISOString(),
  allowWrites:  false,
  inputSchema:  {},
  outputSchema: {},
  steps: [
    {
      stepNumber:            1,
      actionType:            'wait',
      description:           'Wait for login page to fully render',
      sensitive:             false,
      elementData: {
        primary:   { type: 'aria-label',   value: '' },
        secondary: { type: 'placeholder',  value: '' },
        tertiary:  { type: 'text-content', value: '' },
        fallback:  { type: 'coordinates',  value: { x: 640, y: 360 } }
      },
      waitAfter:             500,
      maxRetries:            2,
      checkpoint:            { type: 'url-contains', value: '/auth/login' },
      knownOutcomes:         [],
      recoverableConditions: []
    },
    {
      stepNumber:            2,
      actionType:            'click',
      description:           'Username input field',
      sensitive:             false,
      elementData: {
        primary:   { type: 'aria-label',   value: '' },
        secondary: { type: 'placeholder',  value: 'Username' },
        tertiary:  { type: 'text-content', value: '' },
        fallback:  { type: 'coordinates',  value: { x: 640, y: 380 } }
      },
      waitAfter:             300,
      maxRetries:            2,
      checkpoint:            { type: 'url-contains', value: '/auth/login' },
      knownOutcomes:         [],
      recoverableConditions: []
    }
  ]
}

function makeRunState(): RunState {
  const now = new Date().toISOString()
  return {
    runId:       `e2e-replay-${Date.now()}`,
    type:        'replay',
    status:      'running',
    tenantId:    'e2e-tenant',
    artifactId:  loginPageArtifact.artifactId,
    currentStep: 0,
    isPaused:    false,
    startedAt:   now,
    log: {
      runId:      `e2e-replay-${Date.now()}`,
      type:       'replay',
      artifactId: loginPageArtifact.artifactId,
      tenantId:   'e2e-tenant',
      goal:       loginPageArtifact.goal,
      startedAt:  now,
      status:     'running',
      steps:      []
    }
  }
}

beforeEach(() => {
  setupTestDb()
})

afterEach(() => {
  teardownTestDb()
})

describe('Phase 3 E2E — OrangeHRM replay', () => {
  itE2E(
    'replays fixture artifact against OrangeHRM login page — all steps succeed',
    async () => {
      const state = makeRunState()

      await runReplay(state, loginPageArtifact, {})

      expect(state.status).toBe('success')
      expect(state.log.steps).toHaveLength(2)
      expect(state.log.steps.every(s => s.status === 'success')).toBe(true)

      console.log(`Replay complete — strategies used: ${state.log.steps.map(s => s.elementStrategyUsed).join(', ')}`)
    },
    60_000
  )
})
