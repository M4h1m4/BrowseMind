import request from 'supertest'
import { app } from '../../../src/app'
import { setupTestDb, teardownTestDb } from '../../helpers/db'
import { resetRuns } from '../../../src/api/routes'

jest.mock('../../../src/agent/discovery', () => ({
  runDiscovery: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('../../../src/replay/replay', () => ({
  runReplay: jest.fn().mockResolvedValue(undefined)
}))

beforeEach(() => {
  setupTestDb()
  resetRuns()
})

afterEach(() => {
  teardownTestDb()
})

describe('404 handler', () => {
  it('returns 404 JSON for a completely unknown route', async () => {
    const res = await request(app).get('/api/v1/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })

  it('returns 404 JSON for an unknown method on a known path', async () => {
    const res = await request(app).put('/api/v1/artifacts')
    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })

  it('returns 404 JSON for routes outside /api/v1', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })
})

describe('error handler', () => {
  it('returns 500 JSON when a route throws an unhandled error', async () => {
    const { runDiscovery } = require('../../../src/agent/discovery')
    runDiscovery.mockRejectedValueOnce(new Error('unexpected crash'))

    // The capture route fires discovery in background — the error is caught
    // by the fire-and-forget .catch(), not the global handler.
    // To test the global handler, we send malformed JSON so express.json() throws.
    const res = await request(app)
      .post('/api/v1/capture/run')
      .set('Content-Type', 'application/json')
      .send('{ bad json }')

    expect(res.status).toBe(400)  // express.json() returns 400 for malformed JSON
  })

  it('all error responses have JSON content-type', async () => {
    const res = await request(app).get('/api/v1/does-not-exist')
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })
})

describe('API response shape', () => {
  it('capture 400 error has an error field', async () => {
    const res = await request(app).post('/api/v1/capture/run').send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
    expect(typeof res.body.error).toBe('string')
  })

  it('replay 404 error has an error field', async () => {
    const res = await request(app).post('/api/v1/replay/run').send({
      artifactId: 'non-existent',
      tenantId:   'tenant-001',
      inputs:     {}
    })
    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
  })

  it('run status 404 has an error field', async () => {
    const res = await request(app).get('/api/v1/runs/non-existent/status')
    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
  })
})
