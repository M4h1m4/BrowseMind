import request from 'supertest'
import { app } from '../../../src/app'
import { setupTestDb, teardownTestDb } from '../../helpers/db'
import { saveArtifact } from '../../../src/artifact/repository'
import { sampleArtifact } from '../../helpers/fixtures'

beforeEach(() => {
  setupTestDb()
})

afterEach(() => {
  teardownTestDb()
})

describe('GET /api/v1/artifacts', () => {
  it('lists the default tenant when the caller does not supply one', async () => {
    const res = await request(app).get('/api/v1/artifacts')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.artifacts)).toBe(true)
  })

  it('returns empty array when no artifacts exist for tenant', async () => {
    const res = await request(app).get('/api/v1/artifacts?tenantId=unknown')
    expect(res.status).toBe(200)
    expect(res.body.artifacts).toEqual([])
  })

  it('returns artifacts for the given tenant', async () => {
    saveArtifact(sampleArtifact)
    const res = await request(app).get(`/api/v1/artifacts?tenantId=${sampleArtifact.tenantId}`)
    expect(res.status).toBe(200)
    expect(res.body.artifacts).toHaveLength(1)
    expect(res.body.artifacts[0].artifactId).toBe(sampleArtifact.artifactId)
  })

  it('does not return artifacts from other tenants', async () => {
    saveArtifact(sampleArtifact)
    const res = await request(app).get('/api/v1/artifacts?tenantId=other-tenant')
    expect(res.body.artifacts).toHaveLength(0)
  })
})

describe('GET /api/v1/artifacts/:artifactId', () => {
  it('falls back to the default tenant when the caller does not supply one', async () => {
    saveArtifact(sampleArtifact)
    const res = await request(app).get(`/api/v1/artifacts/${sampleArtifact.artifactId}`)
    // The fixture is filed under its own tenant, so the default cannot see it.
    expect(res.status).toBe(404)
  })

  it('returns the artifact when it exists', async () => {
    saveArtifact(sampleArtifact)
    const res = await request(app)
      .get(`/api/v1/artifacts/${sampleArtifact.artifactId}?tenantId=${sampleArtifact.tenantId}`)
    expect(res.status).toBe(200)
    expect(res.body.artifact.artifactId).toBe(sampleArtifact.artifactId)
    expect(res.body.artifact.goal).toBe(sampleArtifact.goal)
  })

  it('returns 404 when artifact does not exist', async () => {
    const res = await request(app)
      .get('/api/v1/artifacts/non-existent?tenantId=tenant-001')
    expect(res.status).toBe(404)
  })

  it('returns 404 when tenantId does not match', async () => {
    saveArtifact(sampleArtifact)
    const res = await request(app)
      .get(`/api/v1/artifacts/${sampleArtifact.artifactId}?tenantId=wrong-tenant`)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/v1/artifacts/:artifactId', () => {
  it('deletes an existing artifact and returns deleted: true', async () => {
    saveArtifact(sampleArtifact)
    const res = await request(app)
      .delete(`/api/v1/artifacts/${sampleArtifact.artifactId}?tenantId=${sampleArtifact.tenantId}`)
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
  })

  it('will not delete an artifact belonging to another tenant', async () => {
    // The delete matches on tenant as well as id, so an id alone is not enough
    // to remove someone else's automation.
    saveArtifact(sampleArtifact)
    const res = await request(app)
      .delete(`/api/v1/artifacts/${sampleArtifact.artifactId}?tenantId=someone-else`)
    expect(res.status).toBe(404)
  })

  it('returns 404 when artifact does not exist', async () => {
    const res = await request(app).delete('/api/v1/artifacts/non-existent')
    expect(res.status).toBe(404)
  })

  it('artifact is no longer retrievable after deletion', async () => {
    saveArtifact(sampleArtifact)
    await request(app)
      .delete(`/api/v1/artifacts/${sampleArtifact.artifactId}?tenantId=${sampleArtifact.tenantId}`)
    const res = await request(app)
      .get(`/api/v1/artifacts/${sampleArtifact.artifactId}?tenantId=${sampleArtifact.tenantId}`)
    expect(res.status).toBe(404)
  })
})
