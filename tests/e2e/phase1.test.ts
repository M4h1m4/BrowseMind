/**
 * Phase 1 E2E — Scaffold
 *
 * Verifies the full data path:
 *   save artifact (repository) → retrieve via API → start replay run → poll status
 *
 * This is the thinnest cross-component path available in Phase 1.
 * Subsequent phases will add capture → artifact → replay as the full E2E expands.
 */

jest.mock('../../src/replay/replay', () => ({
  runReplay: jest.fn().mockResolvedValue(undefined)
}))

import request from 'supertest'
import { app } from '../../src/app'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { resetRuns } from '../../src/api/routes'
import { saveArtifact } from '../../src/artifact/repository'
import { sampleArtifact } from '../helpers/fixtures'

beforeEach(() => {
  setupTestDb()
  resetRuns()
})

afterEach(() => {
  teardownTestDb()
})

describe('Phase 1 E2E: artifact saved → retrieved via API → replay run started → status polled', () => {
  it('full path completes without errors', async () => {
    // Step 1 — save artifact directly (stands in for capture until Phase 2)
    saveArtifact(sampleArtifact)

    // Step 2 — retrieve artifact via GET API
    const getRes = await request(app)
      .get(`/api/v1/artifacts/${sampleArtifact.artifactId}?tenantId=${sampleArtifact.tenantId}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.artifact.artifactId).toBe(sampleArtifact.artifactId)

    // Step 3 — start a replay run via POST API
    const replayRes = await request(app).post('/api/v1/replay/run').send({
      artifactId: sampleArtifact.artifactId,
      tenantId:   sampleArtifact.tenantId,
      inputs:     { employeeName: 'John Doe' }
    })
    expect(replayRes.status).toBe(202)
    const { runId } = replayRes.body

    // Step 4 — poll run status
    const statusRes = await request(app).get(`/api/v1/runs/${runId}/status`)
    expect(statusRes.status).toBe(200)
    expect(statusRes.body.runId).toBe(runId)
    expect(statusRes.body.status).toBe('running')
  })

  it('replay run is rejected when artifact does not exist', async () => {
    const res = await request(app).post('/api/v1/replay/run').send({
      artifactId: 'does-not-exist',
      tenantId:   'tenant-001',
      inputs:     {}
    })
    expect(res.status).toBe(404)
  })

  it('artifact list for tenant reflects saved artifacts', async () => {
    saveArtifact(sampleArtifact)
    saveArtifact({ ...sampleArtifact, artifactId: 'artifact-002', goal: 'Second goal' })

    const res = await request(app)
      .get(`/api/v1/artifacts?tenantId=${sampleArtifact.tenantId}`)
    expect(res.status).toBe(200)
    expect(res.body.artifacts).toHaveLength(2)
  })

  it('deleted artifact cannot be replayed', async () => {
    saveArtifact(sampleArtifact)

    await request(app).delete(`/api/v1/artifacts/${sampleArtifact.artifactId}`)

    const res = await request(app).post('/api/v1/replay/run').send({
      artifactId: sampleArtifact.artifactId,
      tenantId:   sampleArtifact.tenantId,
      inputs:     {}
    })
    expect(res.status).toBe(404)
  })
})
