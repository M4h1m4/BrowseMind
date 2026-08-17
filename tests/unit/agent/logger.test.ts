import fs from 'fs'
import path from 'path'
import os from 'os'
import { writeRunLog } from '../../../src/agent/logger'
import { RunLog } from '../../../src/types'

const sampleLog: RunLog = {
  runId:      'run-test-001',
  type:       'capture',
  tenantId:   'tenant-001',
  goal:       'Test goal',
  startedAt:  '2026-08-17T10:00:00.000Z',
  completedAt:'2026-08-17T10:01:00.000Z',
  status:     'success',
  steps:      []
}

describe('writeRunLog', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browsemind-test-'))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates the evidence/runs directory if it does not exist', () => {
    writeRunLog(sampleLog)
    expect(fs.existsSync(path.join(tempDir, 'evidence', 'runs'))).toBe(true)
  })

  it('writes a file named {runId}.json', () => {
    writeRunLog(sampleLog)
    const filePath = path.join(tempDir, 'evidence', 'runs', 'run-test-001.json')
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('writes valid JSON that matches the run log', () => {
    writeRunLog(sampleLog)
    const filePath = path.join(tempDir, 'evidence', 'runs', 'run-test-001.json')
    const content  = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RunLog
    expect(content.runId).toBe(sampleLog.runId)
    expect(content.goal).toBe(sampleLog.goal)
    expect(content.status).toBe('success')
  })

  it('is idempotent — overwriting with updated log works', () => {
    writeRunLog(sampleLog)
    writeRunLog({ ...sampleLog, status: 'failed' })
    const filePath = path.join(tempDir, 'evidence', 'runs', 'run-test-001.json')
    const content  = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RunLog
    expect(content.status).toBe('failed')
  })
})
