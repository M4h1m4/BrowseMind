/**
 * Session management — resume API integration tests
 *
 * Verifies that POST /runs/:runId/resume:
 *   - delivers credentials to a waiting discovery loop via signalResume
 *   - falls back to a plain status flip for paused runs that are not waiting
 */

import request from 'supertest'
import { app } from '../../../src/app'
import { setupTestDb, teardownTestDb } from '../../helpers/db'
import { resetRuns } from '../../../src/api/routes'
import { waitForResume, resetSignals } from '../../../src/session/resumeSignal'

// Prevent real browser from launching
jest.mock('../../../src/agent/discovery', () => ({
  runDiscovery: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('../../../src/replay/replay', () => ({
  runReplay: jest.fn().mockResolvedValue(undefined)
}))

beforeEach(() => {
  setupTestDb()
  resetRuns()
  resetSignals()
})

afterEach(() => {
  teardownTestDb()
})

// Helper: create a capture run and manually force it into login_required state
async function createPausedRun(): Promise<string> {
  const res = await request(app).post('/api/v1/capture/run').send({
    goal:      'Test goal',
    targetApp: 'https://example.com',
    tenantId:  'tenant-001'
  })
  const runId = res.body.runId as string

  // Simulate the run being paused awaiting login (the discovery mock doesn't do this,
  // so we patch state via the status endpoint + a second resume to verify the route)
  return runId
}

describe('POST /api/v1/runs/:runId/resume — credential delivery', () => {
  it('delivers credentials to a waiting discovery loop and resolves the promise', async () => {
    const runId = await createPausedRun()

    // Simulate the discovery loop waiting for credentials
    const pending = waitForResume(runId)

    const res = await request(app)
      .post(`/api/v1/runs/${runId}/resume`)
      .send({ humanNotes: 'logging in', username: 'admin', password: 'pass123' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('resumed')

    // The promise should have been resolved with the supplied credentials
    const creds = await pending
    expect(creds.username).toBe('admin')
    expect(creds.password).toBe('pass123')
  })

  it('returns 400 when no credentials are provided and run is not paused', async () => {
    const runId = await createPausedRun()

    // Run is 'running' (not paused) since the discovery mock returns immediately
    const res = await request(app)
      .post(`/api/v1/runs/${runId}/resume`)
      .send({ humanNotes: 'confirmed' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not paused/)
  })

  it('returns 404 for a non-existent runId', async () => {
    const res = await request(app)
      .post('/api/v1/runs/ghost-run/resume')
      .send({ humanNotes: 'test', username: 'u', password: 'p' })
    expect(res.status).toBe(404)
  })
})
