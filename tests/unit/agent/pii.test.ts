/**
 * PII handling — unit tests
 *
 * Covers:
 *   builder.ts  — sensitive field detection and value masking
 *   logger.ts   — screenshotPath scrubbed from sensitive step entries
 */

import { ArtifactBuilder } from '../../../src/agent/builder'
import { writeRunLog } from '../../../src/agent/logger'
import { LLMAction, ElementData, RunLog } from '../../../src/types'
import fs from 'fs'
import path from 'path'
import os from 'os'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAction(overrides: Partial<LLMAction> = {}): LLMAction {
  return {
    checkpointForPreviousStep: null,
    action:            'input',
    coordinates:       { x: 100, y: 200 },
    targetDescription: 'Username field',
    value:             'admin123',
    reasoning:         'Enter credentials',
    requiresLogin:     false,
    goalComplete:      false,
    updatedSummary:    'Entered credentials',
    ...overrides
  }
}

function makeElementData(ariaLabel = '', placeholder = ''): ElementData {
  return {
    primary:   { type: 'aria-label',   value: ariaLabel },
    secondary: { type: 'placeholder',  value: placeholder },
    tertiary:  { type: 'text-content', value: '' },
    fallback:  { type: 'coordinates',  value: { x: 100, y: 200 } }
  }
}

// ─── builder.ts — sensitive detection ────────────────────────────────────────

describe('ArtifactBuilder — sensitive field detection', () => {
  let builder: ArtifactBuilder

  beforeEach(() => { builder = new ArtifactBuilder() })

  it('marks input step as sensitive when aria-label contains "password"', () => {
    builder.addStep(makeAction(), makeElementData('Password'), 1)
    const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
    expect(artifact.steps[0].sensitive).toBe(true)
  })

  it('marks input step as sensitive when placeholder contains "password"', () => {
    builder.addStep(makeAction(), makeElementData('', 'Enter password'), 1)
    const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
    expect(artifact.steps[0].sensitive).toBe(true)
  })

  it('templatizes value for sensitive steps and stores default in inputSchema', () => {
    builder.addStep(makeAction({ value: 'supersecret' }), makeElementData('Password'), 1)
    const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
    // Value is now a template variable, not masked
    expect(artifact.steps[0].value).toMatch(/^\{\{.+\}\}$/)
    // The real value is stored as a default in inputSchema
    const varName = artifact.steps[0].value!.replace(/^\{\{|\}\}$/g, '')
    expect(artifact.inputSchema[varName].default).toBe('supersecret')
    expect(artifact.inputSchema[varName].sensitive).toBe(true)
  })

  it('templatizes value for non-sensitive steps', () => {
    builder.addStep(makeAction({ value: 'John Doe' }), makeElementData('', 'Employee Name'), 1)
    const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
    // All input values are now templatized
    expect(artifact.steps[0].value).toMatch(/^\{\{.+\}\}$/)
    expect(artifact.steps[0].sensitive).toBe(false)
    const varName = artifact.steps[0].value!.replace(/^\{\{|\}\}$/g, '')
    expect(artifact.inputSchema[varName].default).toBe('John Doe')
  })

  it('marks step as sensitive for SSN field', () => {
    builder.addStep(makeAction(), makeElementData('', 'Enter SSN'), 1)
    const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
    expect(artifact.steps[0].sensitive).toBe(true)
  })

  it('marks step as sensitive for credit card field', () => {
    builder.addStep(makeAction(), makeElementData('Credit Card Number'), 1)
    const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
    expect(artifact.steps[0].sensitive).toBe(true)
  })

  it('marks step as sensitive for CVV field', () => {
    builder.addStep(makeAction(), makeElementData('', 'CVV'), 1)
    const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
    expect(artifact.steps[0].sensitive).toBe(true)
  })

  it('is case-insensitive — "PASSWORD" is detected', () => {
    builder.addStep(makeAction(), makeElementData('PASSWORD'), 1)
    const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
    expect(artifact.steps[0].sensitive).toBe(true)
  })

  it('does NOT mark click action as sensitive even on a password field', () => {
    builder.addStep(
      makeAction({ action: 'click', value: null }),
      makeElementData('Password'),
      1
    )
    const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
    expect(artifact.steps[0].sensitive).toBe(false)
  })

  it('does NOT mark regular text input as sensitive', () => {
    builder.addStep(makeAction(), makeElementData('Search', 'Search employees'), 1)
    const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
    expect(artifact.steps[0].sensitive).toBe(false)
  })
})

// ─── logger.ts — screenshotPath scrubbing ─────────────────────────────────────

describe('writeRunLog — PII scrubbing', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browsemind-test-'))
    jest.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function makeRunLog(steps: RunLog['steps']): RunLog {
    const now = new Date().toISOString()
    return {
      runId: 'test-run', type: 'replay', tenantId: 'tenant-001',
      goal: 'test', startedAt: now, status: 'success', steps
    }
  }

  it('removes screenshotPath from sensitive step entries', () => {
    const log = makeRunLog([{
      stepNumber: 1, startTime: '', endTime: '', retryCount: 0,
      status: 'failed', elementStrategyUsed: 'primary',
      sensitive: true,
      screenshotPath: '/evidence/runs/screenshot-1.png',
      errorDetails: '[redacted — sensitive step]'
    }])

    writeRunLog(log)

    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'evidence', 'runs', 'test-run.json'), 'utf-8')
    )
    expect(written.steps[0].screenshotPath).toBeUndefined()
  })

  it('keeps screenshotPath for non-sensitive failed steps', () => {
    const log = makeRunLog([{
      stepNumber: 1, startTime: '', endTime: '', retryCount: 2,
      status: 'failed', elementStrategyUsed: 'fallback',
      sensitive: false,
      screenshotPath: '/evidence/runs/screenshot-1.png',
      errorDetails: 'Checkpoint failed: url-contains "/dashboard"'
    }])

    writeRunLog(log)

    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'evidence', 'runs', 'test-run.json'), 'utf-8')
    )
    expect(written.steps[0].screenshotPath).toBe('/evidence/runs/screenshot-1.png')
  })

  it('handles mixed sensitive and non-sensitive steps correctly', () => {
    const log = makeRunLog([
      {
        stepNumber: 1, startTime: '', endTime: '', retryCount: 0,
        status: 'success', elementStrategyUsed: 'secondary',
        sensitive: true, screenshotPath: '/evidence/screenshot-1.png'
      },
      {
        stepNumber: 2, startTime: '', endTime: '', retryCount: 0,
        status: 'success', elementStrategyUsed: 'primary',
        sensitive: false, screenshotPath: '/evidence/screenshot-2.png'
      }
    ])

    writeRunLog(log)

    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'evidence', 'runs', 'test-run.json'), 'utf-8')
    )
    expect(written.steps[0].screenshotPath).toBeUndefined()   // sensitive — scrubbed
    expect(written.steps[1].screenshotPath).toBe('/evidence/screenshot-2.png')  // not sensitive — kept
  })
})
