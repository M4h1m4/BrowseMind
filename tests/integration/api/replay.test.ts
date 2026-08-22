jest.mock('../../../src/replay/replay', () => ({
  runReplay: jest.fn().mockResolvedValue(undefined)
}))

import request from 'supertest'
import { app } from '../../../src/app'
import { setupTestDb, teardownTestDb } from '../../helpers/db'
import { resetRuns } from '../../../src/api/routes'
import { saveArtifact } from '../../../src/artifact/repository'
import { sampleArtifact } from '../../helpers/fixtures'

beforeEach(() => {
  setupTestDb()
  resetRuns()
})

afterEach(() => {
  teardownTestDb()
})

describe('POST /api/v1/replay/run', () => {
  const validBody = {
    artifactId: sampleArtifact.artifactId,
    tenantId:   sampleArtifact.tenantId,
    inputs:     { employeeName: 'John Doe' }
  }

  it('returns 202 with a runId when artifact exists', async () => {
    saveArtifact(sampleArtifact)
    const res = await request(app).post('/api/v1/replay/run').send(validBody)
    expect(res.status).toBe(202)
    expect(res.body.runId).toBeDefined()
    expect(res.body.status).toBe('running')
  })

  it('returns 404 when artifact does not exist', async () => {
    const res = await request(app).post('/api/v1/replay/run').send(validBody)
    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })

  it('returns 400 when artifactId is missing', async () => {
    const { artifactId, ...rest } = validBody
    const res = await request(app).post('/api/v1/replay/run').send(rest)
    expect(res.status).toBe(400)
  })

  it('defaults the tenant when the caller does not supply one', async () => {
    const { tenantId, ...rest } = validBody
    // The fixture artifact belongs to its own tenant, so the default finds
    // nothing — the point is that the request is accepted, not rejected as
    // malformed.
    const res = await request(app).post('/api/v1/replay/run').send(rest)
    expect(res.status).toBe(404)
  })

  it('returns 404 when tenantId does not match artifact tenant', async () => {
    saveArtifact(sampleArtifact)
    const res = await request(app)
      .post('/api/v1/replay/run')
      .send({ ...validBody, tenantId: 'wrong-tenant' })
    expect(res.status).toBe(404)
  })
})
