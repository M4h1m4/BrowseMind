/**
 * E2E Multi-Sample Add Patient — one goal, two records
 *
 * Exercises the multi-record path end to end, which until now had only mocked
 * integration coverage (tests/integration/api/autoReplayChain.test.ts):
 *
 *   1. Capture  — the LLM discovers the add-patient workflow and registers
 *                 record 1 for real.
 *   2. Chain    — buildReplaySamples() pulls record 2 out of the same goal
 *                 string and maps its values onto the artifact's inputSchema.
 *   3. Replay   — the artifact is replayed with record 2's values, no LLM.
 *   4. Truth    — both patients are read back from the MediTrack database and
 *                 every submitted field is compared against what was asked for.
 *
 * The goal names only the ten fields MediTrack marks required, in the order they
 * appear on the form. All ten survive to the patients table, so nothing asserted
 * here depends on a field the mock site silently drops.
 *
 * Run: RUN_E2E=true npx jest tests/e2e/multiSampleAddPatient.test.ts
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { runDiscovery } from '../../src/agent/discovery'
import { runReplay } from '../../src/replay/replay'
import { findArtifactById } from '../../src/artifact/repository'
import { buildReplaySamples, splitGoalSamples } from '../../src/agent/sampleParser'
import { createMediTrackServer, closeMediTrackDb } from '../../mock-websites/meditrack/server'
import { RunState, Step } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

const TENANT  = 'tenant-multisample'
const DB_PATH = path.resolve(__dirname, '../../meditrack-multisample-test.db')

let server: http.Server
let origin: string

// ── The two records ──────────────────────────────────────────────────────────
// Only the fields MediTrack marks required (the `required` attribute on the
// input, and the "Required Fields" card in the form sidebar). Select values are
// exact option text — "BlueCross BlueShield", not "Blue Cross" — and each SSN is
// exactly four digits, which patient-form.html validates client-side on submit.

interface PatientRecord {
  firstName:      string
  lastName:       string
  dob:            string
  gender:         string
  ssn:            string
  phone:          string
  address:        string
  emergencyName:  string
  emergencyPhone: string
  insurance:      string
}

const RECORD_1: PatientRecord = {
  firstName:      'William',
  lastName:       'Carter',
  dob:            '1983-06-14',
  gender:         'Male',
  ssn:            '4821',
  phone:          '(617) 555-3201',
  address:        '45 Beacon Street, Boston, MA 02108',
  emergencyName:  'Sarah Carter',
  emergencyPhone: '(617) 555-3202',
  insurance:      'Cigna',
}

const RECORD_2: PatientRecord = {
  firstName:      'Elena',
  lastName:       'Vasquez',
  dob:            '1975-11-28',
  gender:         'Female',
  ssn:            '7934',
  phone:          '(312) 555-8470',
  address:        '220 Michigan Avenue, Chicago, IL 60601',
  emergencyName:  'Marco Vasquez',
  emergencyPhone: '(312) 555-8471',
  insurance:      'BlueCross BlueShield',
}

/** Field labels in the order they appear on the MediTrack add-patient form. */
function describeRecord(p: PatientRecord): string {
  return [
    `First Name: "${p.firstName}"`,
    `Last Name: "${p.lastName}"`,
    `Date of Birth: "${p.dob}"`,
    `Gender: "${p.gender}"`,
    `SSN (last 4): "${p.ssn}"`,
    `Phone Number: "${p.phone}"`,
    `Home Address: "${p.address}"`,
    `Emergency Contact Name: "${p.emergencyName}"`,
    `Emergency Contact Phone: "${p.emergencyPhone}"`,
    `Insurance Provider: "${p.insurance}"`,
  ].join(', ') + '.'
}

// The "1)" / "2)" markers must start a line — sampleParser only matches numbered
// separators preceded by a newline.
const GOAL = [
  'Go to the patients tab, click the add new patient button and add these patients ' +
  'and click Register Patient button to submit.',
  '',
  `1) ${describeRecord(RECORD_1)}`,
  '',
  `2) ${describeRecord(RECORD_2)}`,
].join('\n')

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH)
  const meditrack = createMediTrackServer(DB_PATH)
  ;({ server, origin } = await meditrack.start())
})

afterAll(done => {
  closeMediTrackDb()
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH)
  server.close(done)
})

beforeEach(() => { setupTestDb() })
afterEach(() => { teardownTestDb() })

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRunState(runId: string, type: 'capture' | 'replay', artifactId?: string): RunState {
  const now = new Date().toISOString()
  return {
    runId, type, status: 'running', artifactId,
    tenantId: TENANT, currentStep: 0, isPaused: false, startedAt: now,
    log: { runId, type, artifactId, tenantId: TENANT, goal: GOAL, startedAt: now, status: 'running', steps: [] }
  } as RunState
}

function findSteps(steps: Step[], pred: (s: Step) => boolean): Step[] {
  const out: Step[] = []
  for (const s of steps) {
    if (pred(s)) out.push(s)
    if (s.innerSteps) out.push(...findSteps(s.innerSteps, pred))
  }
  return out
}

/** Read the registry back from MediTrack — the source of truth for what was saved. */
function fetchPatients(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    http.get(`${origin}/api/patients`, res => {
      let body = ''
      res.on('data', c => { body += c })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Compare one saved patient row against the record that was asked for. */
function expectPatientMatches(saved: any, want: PatientRecord, label: string): void {
  console.log(`[test] verifying ${label}: ${saved.id} ${saved.firstName} ${saved.lastName}`)

  expect(norm(saved.firstName)).toBe(norm(want.firstName))
  expect(norm(saved.lastName)).toBe(norm(want.lastName))
  expect(saved.dob).toBe(want.dob)
  expect(norm(saved.gender)).toBe(norm(want.gender))
  expect(saved.ssn).toBe(want.ssn)
  expect(norm(saved.phone)).toBe(norm(want.phone))
  expect(norm(saved.address)).toBe(norm(want.address))
  expect(norm(saved.insurance)).toBe(norm(want.insurance))

  // The form merges the two emergency inputs into one column, so assert on parts.
  expect(norm(saved.emergencyContact)).toContain(norm(want.emergencyName))
  expect(norm(saved.emergencyContact)).toContain(norm(want.emergencyPhone))
}

// ── Test ─────────────────────────────────────────────────────────────────────

describe('Multi-sample add patient — one goal, two records', () => {

  itE2E('captures record 1, chains a replay for record 2, and saves both correctly', async () => {
    console.log('[test] ── GOAL ──')
    console.log(GOAL)

    const seeded = await fetchPatients()
    console.log(`[test] registry starts with ${seeded.length} seeded patients`)

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 0: the goal must be seen as two records
    // ══════════════════════════════════════════════════════════════════════

    const parsed = splitGoalSamples(GOAL)
    console.log(`[test] goal holds ${parsed.length} record(s): ${parsed.map(p => p.label).join(' | ')}`)
    expect(parsed.length).toBe(2)

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 1: CAPTURE — registers record 1 for real
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 1: CAPTURE (record 1) ──')
    const captureState = makeRunState('multisample-capture', 'capture')
    await runDiscovery(captureState, GOAL, origin, TENANT, [origin])

    expect(captureState.status).toBe('success')
    expect(captureState.artifactId).toBeDefined()

    const artifact = findArtifactById(captureState.artifactId!, TENANT)
    expect(artifact).toBeDefined()

    const allSteps = artifact!.steps
    console.log(`[test] artifact: ${allSteps.length} steps`)
    allSteps.forEach(s => {
      const val = s.value && s.value !== '****' ? ` = "${s.value}"` : ''
      console.log(`  step ${s.stepNumber}: ${s.actionType} — "${s.description}"${val}${s.isMutating ? ' [MUTATING]' : ''}`)
    })

    // Ten required fields — the workflow must fill roughly that many.
    const inputSteps = findSteps(allSteps, s => s.actionType === 'input')
    console.log(`[test] field-filling steps: ${inputSteps.length}`)
    expect(inputSteps.length).toBeGreaterThanOrEqual(8)

    // Submitting is a write, so the artifact must be allowed to perform one.
    expect(artifact!.allowWrites).toBe(true)
    const mutating = findSteps(allSteps, s => s.isMutating === true)
    expect(mutating.length).toBeGreaterThanOrEqual(1)

    expect(captureState.log.steps.filter(s => s.status === 'failed').length).toBe(0)
    console.log('[test] ── CAPTURE PASSED ──')

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 2: CHAIN — record 2 becomes replay inputs
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 2: CHAIN ──')
    console.log('[test] artifact inputSchema:')
    for (const [varName, info] of Object.entries(artifact!.inputSchema)) {
      console.log(`  {{${varName}}} — default: "${info.default}"`)
    }

    const samples = buildReplaySamples(GOAL, artifact!.inputSchema)
    console.log(`[test] chained samples: ${samples.length}`)
    samples.forEach(s => console.log(`  "${s.label}" → ${JSON.stringify(s.inputs)}`))

    // One record follows the captured one, so exactly one replay should chain.
    expect(samples.length).toBe(1)
    const replayInputs = samples[0].inputs
    expect(Object.keys(replayInputs).length).toBeGreaterThan(0)

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 3: REPLAY — registers record 2, no LLM
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 3: REPLAY (record 2) ──')
    const replayState = makeRunState('multisample-replay', 'replay', captureState.artifactId!)
    await runReplay(replayState, artifact!, replayInputs)

    console.log(`[test] replay status: ${replayState.status}`)
    replayState.log.steps.forEach(s => {
      const err = s.errorDetails ? ` — ${s.errorDetails}` : ''
      console.log(`  step ${(s as any).stepPath ?? s.stepNumber}: ${s.status} (${s.elementStrategyUsed})${err}`)
    })

    expect(replayState.status).toBe('success')
    expect(replayState.log.steps.filter(s => s.status === 'failed').length).toBe(0)
    expect(replayState.log.error).toBeUndefined()

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 4: TRUTH — both patients saved, every field correct
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 4: DATABASE VERIFICATION ──')
    const after = await fetchPatients()
    console.log(`[test] registry now holds ${after.length} patients (was ${seeded.length})`)

    // Capture wrote one, the chained replay wrote the other.
    expect(after.length).toBe(seeded.length + 2)

    const savedFirst = after.find(
      p => norm(p.firstName) === norm(RECORD_1.firstName) && norm(p.lastName) === norm(RECORD_1.lastName)
    )
    const savedSecond = after.find(
      p => norm(p.firstName) === norm(RECORD_2.firstName) && norm(p.lastName) === norm(RECORD_2.lastName)
    )

    expect(savedFirst).toBeDefined()
    expect(savedSecond).toBeDefined()

    expectPatientMatches(savedFirst, RECORD_1, 'record 1 (capture)')
    expectPatientMatches(savedSecond, RECORD_2, 'record 2 (chained replay)')

    console.log('[test] ── MULTI-SAMPLE PASSED ──')
  }, 420000) // 7 min — one capture (LLM) plus one replay, both driving a real browser
})
