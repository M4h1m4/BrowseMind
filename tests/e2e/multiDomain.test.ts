/**
 * Multi-Domain E2E — Cross-site navigation
 *
 * Verifies that BrowseMind can replay a workflow that crosses between two
 * different local origins (different ports = different origins in browsers).
 *
 * Two local HTTP servers are started:
 *   - App A  (e.g. :41001) — simulates the main app
 *   - App B  (e.g. :41002) — simulates a second app (auth, payments, etc.)
 *
 * Tests:
 *   1. Replay succeeds when both origins are in allowedDomains
 *   2. Replay fails (blocks navigation) when the second origin is NOT in allowedDomains
 *
 * Run: RUN_E2E=true npm run test:e2e -- --testPathPattern="multiDomain"
 */

import http from 'http'
import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { runReplay } from '../../src/replay/replay'
import { RunState, Artifact } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

// ── Two local servers ─────────────────────────────────────────────────────────

let serverA: http.Server
let serverB: http.Server
let originA: string  // http://127.0.0.1:<portA>
let originB: string  // http://127.0.0.1:<portB>

function startServer(html: string): Promise<{ server: http.Server; origin: string }> {
  return new Promise(resolve => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      resolve({ server, origin: `http://127.0.0.1:${port}` })
    })
  })
}

beforeAll(async () => {
  ;({ server: serverA, origin: originA } = await startServer(
    '<html><body><h1>App A</h1><a href="ORIGIN_B">Go to App B</a></body></html>'
  ))
  ;({ server: serverB, origin: originB } = await startServer(
    '<html><body><h1>App B</h1></body></html>'
  ))

  // Patch the link on App A to point to the real App B origin
  serverA.removeAllListeners('request')
  serverA.on('request', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<html><body><h1>App A</h1><a href="${originB}/page">Go to App B</a></body></html>`)
  })
})

afterAll(done => {
  serverA.close(() => serverB.close(done))
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRunState(runId: string): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'replay', status: 'running',
    tenantId: 'tenant-e2e', artifactId: 'artifact-e2e',
    currentStep: 0, isPaused: false, startedAt: now,
    log: {
      runId, type: 'replay', artifactId: 'artifact-e2e',
      tenantId: 'tenant-e2e', goal: 'Multi-domain test',
      startedAt: now, status: 'running', steps: []
    }
  }
}

function makeArtifact(allowedDomains?: string[]): Artifact {
  return {
    artifactId: 'artifact-e2e', tenantId: 'tenant-e2e', version: 1,
    goal: 'Navigate from App A to App B',
    targetApp: originA,
    allowedDomains,
    createdAt: new Date().toISOString(),
    allowWrites: true, inputSchema: {}, outputSchema: {},
    steps: [
      {
        stepNumber: 1,
        actionType: 'navigate',
        description: 'Navigate directly to App B',
        value: `${originB}/page`,
        sensitive: false,
        elementData: {
          primary:   { type: 'aria-label',   value: '' },
          secondary: { type: 'placeholder',  value: '' },
          tertiary:  { type: 'text-content', value: '' },
          fallback:  { type: 'coordinates',  value: { x: 0, y: 0 } }
        },
        waitAfter: 200,
        maxRetries: 0,
        checkpoint:            { type: 'url-contains', value: '' },
        knownOutcomes:         [],
        recoverableConditions: []
      }
    ]
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => { setupTestDb() })
afterEach(() => { teardownTestDb() })

describe('Multi-domain navigation', () => {
  itE2E('succeeds when both origins are in allowedDomains', async () => {
    const state    = makeRunState('multi-domain-001')
    const artifact = makeArtifact([originA, originB])

    await runReplay(state, artifact, {})

    expect(state.status).toBe('success')
    expect(state.log.steps[0].status).toBe('success')
  }, 40000)

  itE2E('blocks navigation when second origin is NOT in allowedDomains', async () => {
    const state    = makeRunState('multi-domain-002')
    const artifact = makeArtifact([originA])  // originB is not allowed

    await runReplay(state, artifact, {})

    expect(state.status).toBe('failed')
    expect(state.log.error?.observed).toContain('external domain blocked')
  }, 40000)

  itE2E('defaults to targetApp-only when allowedDomains is omitted (single-site behaviour preserved)', async () => {
    const state    = makeRunState('multi-domain-003')
    const artifact = makeArtifact(undefined)  // no allowedDomains — old behaviour

    await runReplay(state, artifact, {})

    // originB is not allowed — navigation should be blocked
    expect(state.status).toBe('failed')
    expect(state.log.error?.observed).toContain('external domain blocked')
  }, 40000)
})
