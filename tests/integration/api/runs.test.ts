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

async function createCaptureRun(): Promise<string> {
  const res = await request(app).post('/api/v1/capture/run').send({
    goal:      'Test goal',
    targetApp: 'https://example.com',
    tenantId:  'tenant-001'
  })
  return res.body.runId as string
}

describe('GET /api/v1/runs/:runId/status', () => {
  it('returns status for an existing run', async () => {
    const runId = await createCaptureRun()
    const res = await request(app).get(`/api/v1/runs/${runId}/status`)
    expect(res.status).toBe(200)
    expect(res.body.runId).toBe(runId)
    expect(res.body.status).toBe('running')
    expect(res.body.currentStep).toBe(0)
  })

  it('returns 404 for a non-existent run', async () => {
    const res = await request(app).get('/api/v1/runs/non-existent-run/status')
    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })
})

describe('POST /api/v1/runs/:runId/resume', () => {
  it('returns 404 for a non-existent run', async () => {
    const res = await request(app)
      .post('/api/v1/runs/non-existent/resume')
      .send({ humanNotes: 'Done' })
    expect(res.status).toBe(404)
  })

  it('returns 400 when run is not paused', async () => {
    const runId = await createCaptureRun()
    const res = await request(app)
      .post(`/api/v1/runs/${runId}/resume`)
      .send({ humanNotes: 'Done' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not paused/)
  })
})

describe('POST /api/v1/runs/:runId/takeover', () => {
  it('returns 404 for a non-existent run', async () => {
    const res = await request(app).post('/api/v1/runs/non-existent/takeover').send({})
    expect(res.status).toBe(404)
  })

  it('returns human_in_control for an existing run', async () => {
    const runId = await createCaptureRun()
    const res = await request(app).post(`/api/v1/runs/${runId}/takeover`).send({})
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('human_in_control')
  })
})
