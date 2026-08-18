/**
 * Phase 4 E2E — API Layer
 *
 * Verifies that capture and replay are triggered and polled entirely via HTTP.
 * No direct calls to runDiscovery or runReplay from the test — everything goes
 * through the API.
 *
 * The engines are mocked so no real browser or LLM is needed. The focus is on:
 *   - Correct HTTP status codes
 *   - RunId lifecycle (assign on POST → poll via GET → result via GET)
 *   - Artifact retrieval via API after a successful run
 */

import request from 'supertest'
import { app } from '../../src/app'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { resetRuns } from '../../src/api/routes'
import { saveArtifact } from '../../src/artifact/repository'
import { sampleArtifact } from '../helpers/fixtures'
import { RunState } from '../../src/types'

// ─── Controlled engine mocks ─────────────────────────────────────────────────
// Each mock immediately marks the run as success so the status poll resolves.

jest.mock('../../src/agent/discovery', () => ({
  runDiscovery: jest.fn().mockImplementation(async (state: RunState) => {
    state.status     = 'success'
    state.artifactId = 'mock-artifact-id'
  })
}))

jest.mock('../../src/replay/replay', () => ({
  runReplay: jest.fn().mockImplementation(async (state: RunState) => {
    state.status = 'success'
  })
}))

beforeEach(() => {
  setupTestDb()
  resetRuns()
})

afterEach(() => {
  teardownTestDb()
})

// Allow the fire-and-forget mock to run before polling status
async function tick() {
  await new Promise(resolve => setImmediate(resolve))
}

describe('Phase 4 E2E — API-only capture flow', () => {
  it('POST capture → runId returned → poll status → success', async () => {
    // 1. Start capture via API only
    const startRes = await request(app).post('/api/v1/capture/run').send({
      goal:      'Search for employee John Doe',
      targetApp: 'https://opensource-demo.orangehrmlive.com',
      tenantId:  'tenant-001'
    })
    expect(startRes.status).toBe(202)
    const { runId } = startRes.body
    expect(runId).toBeDefined()
    expect(startRes.body.status).toBe('running')

    // 2. Let the mock engine run
    await tick()

    // 3. Poll status via API only
    const statusRes = await request(app).get(`/api/v1/runs/${runId}/status`)
    expect(statusRes.status).toBe(200)
    expect(statusRes.body.runId).toBe(runId)
    expect(statusRes.body.status).toBe('success')
  })

  it('each capture run gets a unique runId', async () => {
    const body = { goal: 'Test', targetApp: 'https://example.com', tenantId: 'tenant-001' }

    const res1 = await request(app).post('/api/v1/capture/run').send(body)
    const res2 = await request(app).post('/api/v1/capture/run').send(body)

    expect(res1.body.runId).not.toBe(res2.body.runId)
  })

  it('unknown runId returns 404 via API', async () => {
    const res = await request(app).get('/api/v1/runs/does-not-exist/status')
    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })
})

describe('Phase 4 E2E — API-only replay flow', () => {
  it('POST replay → runId returned → poll status → success', async () => {
    // 1. Artifact must exist — saved directly as test setup (not via API)
    saveArtifact(sampleArtifact)

    // 2. Start replay via API only
    const startRes = await request(app).post('/api/v1/replay/run').send({
      artifactId: sampleArtifact.artifactId,
      tenantId:   sampleArtifact.tenantId,
      inputs:     { employeeName: 'John Doe' }
    })
    expect(startRes.status).toBe(202)
    const { runId } = startRes.body
    expect(runId).toBeDefined()

    // 3. Let the mock engine run
    await tick()

    // 4. Poll status via API only
    const statusRes = await request(app).get(`/api/v1/runs/${runId}/status`)
    expect(statusRes.status).toBe(200)
    expect(statusRes.body.status).toBe('success')
  })

  it('replay returns 404 when artifact does not exist', async () => {
    const res = await request(app).post('/api/v1/replay/run').send({
      artifactId: 'non-existent',
      tenantId:   'tenant-001',
      inputs:     {}
    })
    expect(res.status).toBe(404)
  })
})

describe('Phase 4 E2E — API-only artifact retrieval', () => {
  it('artifact is retrievable via GET after being saved', async () => {
    saveArtifact(sampleArtifact)

    const res = await request(app)
      .get(`/api/v1/artifacts/${sampleArtifact.artifactId}?tenantId=${sampleArtifact.tenantId}`)

    expect(res.status).toBe(200)
    expect(res.body.artifact.artifactId).toBe(sampleArtifact.artifactId)
    expect(res.body.artifact.goal).toBe(sampleArtifact.goal)
    expect(res.body.artifact.steps).toHaveLength(1)
  })

  it('artifact list returns all artifacts for a tenant via GET', async () => {
    saveArtifact(sampleArtifact)
    saveArtifact({ ...sampleArtifact, artifactId: 'artifact-002', goal: 'Second goal' })

    const res = await request(app)
      .get(`/api/v1/artifacts?tenantId=${sampleArtifact.tenantId}`)

    expect(res.status).toBe(200)
    expect(res.body.artifacts).toHaveLength(2)
  })

  it('DELETE removes artifact and subsequent GET returns 404', async () => {
    saveArtifact(sampleArtifact)

    const deleteRes = await request(app)
      .delete(`/api/v1/artifacts/${sampleArtifact.artifactId}`)
    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.deleted).toBe(true)

    const getRes = await request(app)
      .get(`/api/v1/artifacts/${sampleArtifact.artifactId}?tenantId=${sampleArtifact.tenantId}`)
    expect(getRes.status).toBe(404)
  })
})
