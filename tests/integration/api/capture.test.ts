import request from 'supertest'
import { app } from '../../../src/app'
import { setupTestDb, teardownTestDb } from '../../helpers/db'
import { resetRuns } from '../../../src/api/routes'

beforeEach(() => {
  setupTestDb()
  resetRuns()
})

afterEach(() => {
  teardownTestDb()
})

describe('POST /api/v1/capture/run', () => {
  const validBody = {
    goal:      'Search for employee John Doe and return their ID',
    targetApp: 'https://opensource-demo.orangehrmlive.com',
    tenantId:  'tenant-001'
  }

  it('returns 202 with a runId and status running for a valid request', async () => {
    const res = await request(app).post('/api/v1/capture/run').send(validBody)
    expect(res.status).toBe(202)
    expect(res.body.runId).toBeDefined()
    expect(res.body.status).toBe('running')
  })

  it('returns 400 when goal is missing', async () => {
    const { goal, ...rest } = validBody
    const res = await request(app).post('/api/v1/capture/run').send(rest)
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('returns 400 when targetApp is missing', async () => {
    const { targetApp, ...rest } = validBody
    const res = await request(app).post('/api/v1/capture/run').send(rest)
    expect(res.status).toBe(400)
  })

  it('returns 400 when tenantId is missing', async () => {
    const { tenantId, ...rest } = validBody
    const res = await request(app).post('/api/v1/capture/run').send(rest)
    expect(res.status).toBe(400)
  })

  it('generates a unique runId for each request', async () => {
    const res1 = await request(app).post('/api/v1/capture/run').send(validBody)
    const res2 = await request(app).post('/api/v1/capture/run').send(validBody)
    expect(res1.body.runId).not.toBe(res2.body.runId)
  })
})
