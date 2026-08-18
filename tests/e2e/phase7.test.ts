/**
 * Phase 7 E2E — Human Escalation
 *
 * Tests the stuck detection and human handoff flow.
 * A local HTTP server is used as the target app so the test runs fast
 * without depending on external network connectivity.
 *
 * A replay step targets a non-existent element so it gets stuck,
 * then a human (or timeout) signals the handoff.
 *
 * Run: RUN_E2E=true npm run test:e2e -- --testPathPattern="phase7"
 */

import http from 'http'
import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { signalHandoff, cancelHandoff, resetHandoffs } from '../../src/session/handoffSignal'
import { runReplay } from '../../src/replay/replay'
import { RunState, Artifact } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

// ── Local test server — serves a minimal page so we avoid external network ──
let server: http.Server
let TARGET_APP: string

beforeAll(done => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<html><body><h1>Phase 7 test page</h1></body></html>')
  })
  server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as { port: number }
    TARGET_APP = `http://127.0.0.1:${addr.port}`
    done()
  })
})

afterAll(done => {
  server.close(done)
})

function makeRunState(runId = 'e2e-phase7-001'): RunState {
  const now = new Date().toISOString()
  return {
    runId,
    type:        'replay',
    status:      'running',
    tenantId:    'tenant-e2e',
    artifactId:  'artifact-e2e',
    currentStep: 0,
    isPaused:    false,
    startedAt:   now,
    log: {
      runId,
      type:       'replay',
      artifactId: 'artifact-e2e',
      tenantId:   'tenant-e2e',
      goal:       'E2E Phase 7 stuck + handoff test',
      startedAt:  now,
      status:     'running',
      steps:      []
    }
  }
}

function makeArtifactWithNonExistentElement(): Artifact {
  return {
    artifactId:   'artifact-e2e',
    tenantId:     'tenant-e2e',
    version:      1,
    goal:         'E2E Phase 7 stuck + handoff test',
    targetApp:    TARGET_APP,
    createdAt:    new Date().toISOString(),
    allowWrites:  true,
    inputSchema:  {},
    outputSchema: {},
    steps: [
      {
        stepNumber:            1,
        actionType:            'click',
        description:           'Click a button that does not exist',
        sensitive:             false,
        elementData: {
          primary:   { type: 'aria-label',   value: 'NONEXISTENT_BUTTON_PHASE7' },
          secondary: { type: 'placeholder',  value: 'NONEXISTENT_PHASE7' },
          tertiary:  { type: 'text-content', value: 'NONEXISTENT_PHASE7' },
          fallback:  { type: 'coordinates',  value: { x: -9999, y: -9999 } }
        },
        waitAfter:             500,
        maxRetries:            1,
        checkpoint:            { type: 'url-contains', value: '' },
        knownOutcomes:         [],
        recoverableConditions: []
      }
    ]
  }
}

beforeEach(() => {
  setupTestDb()
  resetHandoffs()
})

afterEach(() => {
  teardownTestDb()
  resetHandoffs()
})

describe('Phase 7 — Human Escalation E2E', () => {
  itE2E('sets status to stuck when element cannot be found, then fails gracefully on cancelled handoff', async () => {
    const state    = makeRunState()
    const artifact = makeArtifactWithNonExistentElement()

    // Cancel handoff after 8 seconds — the local server loads instantly so stuck is reached fast
    const timer = setTimeout(() => cancelHandoff(state.runId), 8000)

    try {
      await runReplay(state, artifact, {})
    } finally {
      clearTimeout(timer)
    }

    // Handoff was cancelled — run should be marked failed
    expect(['stuck', 'failed']).toContain(state.status)
  }, 30000)

  itE2E('recovers after human signals handoff done', async () => {
    const state    = makeRunState('e2e-phase7-002')
    const artifact = makeArtifactWithNonExistentElement()

    // Signal "done" after 8 seconds — simulates human completing the step manually
    const timer = setTimeout(() => signalHandoff(state.runId, 'I navigated manually'), 8000)

    try {
      await runReplay(state, artifact, {})
    } finally {
      clearTimeout(timer)
    }

    // The key assertion: stuck log entry must carry humanNotes
    const stuckEntry = state.log.steps.find(s => s.status === 'stuck')
    expect(stuckEntry).toBeDefined()
    expect(stuckEntry?.humanNotes).toBe('I navigated manually')

    // Final status should be either success or failed (not stuck indefinitely)
    expect(['success', 'failed']).toContain(state.status)
  }, 30000)
})
