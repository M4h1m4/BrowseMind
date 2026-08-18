/**
 * Phase 5 E2E — Guardrails
 *
 * Verifies that domain and write guardrails are enforced against a real browser.
 * Uses the OrangeHRM login page as the target.
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

function makeRunState(runId = `e2e-guardrail-${Date.now()}`): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'replay', status: 'running', tenantId: 'e2e-tenant',
    artifactId: 'guardrail-fixture', currentStep: 0, isPaused: false, startedAt: now,
    log: {
      runId, type: 'replay', artifactId: 'guardrail-fixture',
      tenantId: 'e2e-tenant', goal: 'Guardrail test', startedAt: now,
      status: 'running', steps: []
    }
  }
}

function baseArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    artifactId: 'guardrail-fixture', tenantId: 'e2e-tenant', version: 1,
    goal: 'Guardrail test', targetApp: LOGIN_URL,
    createdAt: new Date().toISOString(), allowWrites: true,
    inputSchema: {}, outputSchema: {},
    steps: [{
      stepNumber: 1, actionType: 'wait', description: 'Wait for login page',
      sensitive: false,
      elementData: {
        primary:   { type: 'aria-label',   value: '' },
        secondary: { type: 'placeholder',  value: '' },
        tertiary:  { type: 'text-content', value: '' },
        fallback:  { type: 'coordinates',  value: { x: 640, y: 360 } }
      },
      waitAfter: 500, maxRetries: 1,
      checkpoint: { type: 'url-contains', value: '/auth/login' },
      knownOutcomes: [], recoverableConditions: []
    }],
    ...overrides
  }
}

beforeEach(() => { setupTestDb() })
afterEach(() => { teardownTestDb() })

describe('Phase 5 E2E — Guardrails on real browser', () => {
  itE2E(
    'read-only artifact with allowWrites false succeeds — wait step passes',
    async () => {
      const state = makeRunState()
      await runReplay(state, baseArtifact({ allowWrites: false }), {})
      // wait is read-only, so allowWrites: false does not block it
      expect(state.status).toBe('success')
    },
    60_000
  )

  itE2E(
    'write action is blocked immediately when allowWrites is false',
    async () => {
      const artifact = baseArtifact({
        allowWrites: false,
        steps: [{
          stepNumber: 1, actionType: 'input', description: 'Enter username',
          sensitive: false,
          elementData: {
            primary:   { type: 'aria-label',   value: '' },
            secondary: { type: 'placeholder',  value: 'Username' },
            tertiary:  { type: 'text-content', value: '' },
            fallback:  { type: 'coordinates',  value: { x: 640, y: 380 } }
          },
          waitAfter: 300, maxRetries: 1,
          checkpoint: { type: 'url-contains', value: '/auth/login' },
          knownOutcomes: [], recoverableConditions: []
        }]
      })

      const state = makeRunState()
      await runReplay(state, artifact, {})

      expect(state.status).toBe('failed')
      expect(state.log.error?.observed).toContain('write action')
    },
    60_000
  )

  itE2E(
    'navigate to external domain is blocked before the request is made',
    async () => {
      const artifact = baseArtifact({
        steps: [{
          stepNumber: 1, actionType: 'navigate', description: 'Go to external site',
          value: 'https://google.com',
          sensitive: false,
          elementData: {
            primary:   { type: 'aria-label',   value: '' },
            secondary: { type: 'placeholder',  value: '' },
            tertiary:  { type: 'text-content', value: '' },
            fallback:  { type: 'coordinates',  value: { x: 640, y: 360 } }
          },
          waitAfter: 500, maxRetries: 0,
          checkpoint: { type: 'url-contains', value: 'google.com' },
          knownOutcomes: [], recoverableConditions: []
        }]
      })

      const state = makeRunState()
      await runReplay(state, artifact, {})

      expect(state.status).toBe('failed')
      expect(state.log.error?.observed).toContain('external domain blocked')
    },
    60_000
  )

  itE2E(
    'destructive action pauses run with confirmation_required',
    async () => {
      const artifact = baseArtifact({
        steps: [{
          stepNumber: 1, actionType: 'click', description: 'Click Delete employee record',
          sensitive: false,
          elementData: {
            primary:   { type: 'aria-label',   value: '' },
            secondary: { type: 'placeholder',  value: '' },
            tertiary:  { type: 'text-content', value: '' },
            fallback:  { type: 'coordinates',  value: { x: 640, y: 360 } }
          },
          waitAfter: 500, maxRetries: 1,
          checkpoint: { type: 'url-contains', value: '' },
          knownOutcomes: [], recoverableConditions: []
        }]
      })

      const state = makeRunState()
      await runReplay(state, artifact, {})

      expect(state.status).toBe('confirmation_required')
      expect(state.isPaused).toBe(true)
    },
    60_000
  )
})
