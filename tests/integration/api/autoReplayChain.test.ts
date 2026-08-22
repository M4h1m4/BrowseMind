/**
 * A goal carrying several data records should capture the first one and then
 * replay the rest on its own — the operator never re-enters data they already
 * supplied in the goal.
 */

jest.mock('../../../src/replay/replay', () => ({
  runReplay: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('../../../src/agent/discovery', () => ({
  runDiscovery: jest.fn()
}))

import request from 'supertest'
import { app } from '../../../src/app'
import { setupTestDb, teardownTestDb } from '../../helpers/db'
import { resetRuns } from '../../../src/api/routes'
import { saveArtifact } from '../../../src/artifact/repository'
import { sampleArtifact } from '../../helpers/fixtures'
import { runDiscovery } from '../../../src/agent/discovery'
import { runReplay } from '../../../src/replay/replay'
import { Artifact, RunState } from '../../../src/types'

const mockDiscovery = runDiscovery as jest.MockedFunction<typeof runDiscovery>
const mockReplay    = runReplay as jest.MockedFunction<typeof runReplay>

const TENANT = 'tenant-chain'

const GOAL = `Go to the patients tab and add a patient. First Name and Last Name: "William H. Carter", Gender: "Male", Blood Type: "O-", Insurance Provider: "Cigna". Click register patient.

Second patient:
First Name and Last Name: "Elena R. Vasquez", Gender: "Female", Blood Type: "A+", Insurance Provider: "Blue Cross".

Third patient:
First Name and Last Name: "Marco T. Diaz", Gender: "Male", Blood Type: "B+", Insurance Provider: "Aetna".`

const CAPTURED: Artifact = {
  ...sampleArtifact,
  artifactId:  'artifact-chain',
  tenantId:    TENANT,
  goal:        GOAL,
  inputSchema: {
    firstName:         { type: 'string', default: 'William H.' },
    lastName:          { type: 'string', default: 'Carter' },
    gender:            { type: 'string', default: 'Male' },
    bloodType:         { type: 'string', default: 'O-' },
    insuranceProvider: { type: 'string', default: 'Cigna' }
  }
}

/** Make capture "succeed" and save the artifact, the way discovery would. */
function captureSucceeds(artifact: Artifact = CAPTURED) {
  mockDiscovery.mockImplementation(async (state: RunState) => {
    saveArtifact(artifact)
    state.status     = 'success'
    state.artifactId = artifact.artifactId
  })
}

/** Let the fire-and-forget promise chain settle. */
const settle = () => new Promise(resolve => setImmediate(resolve))

async function startCapture(body: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/v1/capture/run').send({
    goal:      GOAL,
    targetApp: 'http://localhost:4000',
    tenantId:  TENANT,
    ...body
  })
  return res.body.runId as string
}

const statusOf = async (runId: string) =>
  (await request(app).get(`/api/v1/runs/${runId}/status`)).body

beforeEach(() => {
  setupTestDb()
  resetRuns()
  mockReplay.mockReset()
  mockReplay.mockResolvedValue(undefined)
  mockDiscovery.mockReset()
})

afterEach(() => teardownTestDb())

describe('capture → automatic replay of the remaining records', () => {
  it('reports the queued record count before capture finishes', async () => {
    mockDiscovery.mockImplementation(() => new Promise(() => {}))  // never resolves
    const runId = await startCapture()
    expect((await statusOf(runId)).pendingSamples).toBe(2)
  })

  it('replays the second record automatically, with values from the goal', async () => {
    captureSucceeds()
    const runId = await startCapture()
    await settle()

    expect(mockReplay).toHaveBeenCalledTimes(1)
    const [, artifact, inputs] = mockReplay.mock.calls[0]
    expect(artifact.artifactId).toBe('artifact-chain')
    expect(inputs).toEqual({
      firstName:         'Elena R.',
      lastName:          'Vasquez',
      gender:            'Female',
      bloodType:         'A+',
      insuranceProvider: 'Blue Cross'
    })
  })

  it('hands the client the chained runId, labelled with the record', async () => {
    captureSucceeds()
    mockReplay.mockImplementation(async (state: RunState) => { state.status = 'success' })
    const runId = await startCapture()
    await settle()

    const status = await statusOf(runId)
    expect(status.chainedRunId).toBeDefined()

    const replayStatus = await statusOf(status.chainedRunId)
    expect(replayStatus.sampleLabel).toBe('Second patient')
    expect(replayStatus.pendingSamples).toBe(1)   // the third record is still queued
  })

  it('continues to the third record once the second succeeds', async () => {
    captureSucceeds()
    mockReplay.mockImplementation(async (state: RunState) => { state.status = 'success' })

    await startCapture()
    await settle()
    await settle()

    expect(mockReplay).toHaveBeenCalledTimes(2)
    expect(mockReplay.mock.calls[1][2]).toMatchObject({
      firstName:         'Marco T.',
      lastName:          'Diaz',
      insuranceProvider: 'Aetna'
    })
  })

  it('stops the chain when a record fails rather than piling on', async () => {
    captureSucceeds()
    mockReplay.mockImplementation(async (state: RunState) => { state.status = 'failed' })

    await startCapture()
    await settle()
    await settle()

    expect(mockReplay).toHaveBeenCalledTimes(1)
  })

  it('does not replay a single-record goal unless asked', async () => {
    const single = { ...CAPTURED, goal: 'Add a patient Gender: "Male".' }
    captureSucceeds(single)

    const runId = await request(app).post('/api/v1/capture/run').send({
      goal:      single.goal,
      targetApp: 'http://localhost:4000',
      tenantId:  TENANT
    }).then(r => r.body.runId)
    await settle()

    expect(mockReplay).not.toHaveBeenCalled()
    expect((await statusOf(runId)).pendingSamples).toBe(0)
  })

  it('replays a single-record goal with captured defaults when autoReplay is set', async () => {
    const single = { ...CAPTURED, goal: 'Add a patient Gender: "Male".' }
    captureSucceeds(single)

    await request(app).post('/api/v1/capture/run').send({
      goal:       single.goal,
      targetApp:  'http://localhost:4000',
      tenantId:   TENANT,
      autoReplay: true
    })
    await settle()

    expect(mockReplay).toHaveBeenCalledTimes(1)
    expect(mockReplay.mock.calls[0][2]).toEqual({})
  })

  it('does not replay when capture itself failed', async () => {
    mockDiscovery.mockImplementation(async (state: RunState) => { state.status = 'failed' })

    await startCapture()
    await settle()

    expect(mockReplay).not.toHaveBeenCalled()
  })
})
