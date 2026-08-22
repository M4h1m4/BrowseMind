/**
 * E2E Add Patient — Capture + Replay Full Cycle
 *
 * Tests the complete add-patient workflow:
 *   1. Capture phase — LLM learns the workflow (dry run, mutating steps skipped)
 *   2. Replay phase — executes the captured artifact (mutating steps execute for real)
 *
 * Run: RUN_E2E=true npm run test:e2e -- --testPathPattern="addPatientReplay"
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { runDiscovery } from '../../src/agent/discovery'
import { runReplay } from '../../src/replay/replay'
import { findArtifactById } from '../../src/artifact/repository'
import { createMediTrackServer, closeMediTrackDb } from '../../src/meditrack/server'
import { RunState, Step } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

let server: http.Server
let origin: string

// ── Patient data ─────────────────────────────────────────────────────────────

// Patient used during CAPTURE phase
const CAPTURE_PATIENT = {
  name:             'William H. Carter',
  dob:              '1983-06-14',
  gender:           'Male',
  ssn:              '4821',
  phone:            '(617) 555-3201',
  email:            'w.carter@email.com',
  bloodType:        'O-',
  address:          '45 Beacon Street, Boston, MA 02108',
  conditions:       'Asthma',
  allergies:        'None known',
  insurance:        'Cigna',
  emergencyContact: 'Sarah Carter (617) 555-3202',
}

// Different patient used during REPLAY phase — proves replay works with unseen data
const REPLAY_PATIENT = {
  name:             'Elena R. Vasquez',
  dob:              '1975-11-28',
  gender:           'Female',
  ssn:              '7934',
  phone:            '(312) 555-8470',
  email:            'e.vasquez@email.com',
  bloodType:        'A+',
  address:          '220 Michigan Avenue, Chicago, IL 60601',
  conditions:       'Type 2 Diabetes',
  allergies:        'Penicillin',
  insurance:        'Blue Cross',
  emergencyContact: 'Marco Vasquez (312) 555-8471',
}

const GOAL = [
  'Go to the patients tab and click on add patient.',
  `Fill in the following details:`,
  `First Name and Last Name: "${CAPTURE_PATIENT.name}",`,
  `Date of Birth: "${CAPTURE_PATIENT.dob}", Gender: "${CAPTURE_PATIENT.gender}",`,
  `SSN last 4 digits: "${CAPTURE_PATIENT.ssn}",`,
  `Phone Number: "${CAPTURE_PATIENT.phone}", Email Address: "${CAPTURE_PATIENT.email}",`,
  `Blood Type: "${CAPTURE_PATIENT.bloodType}",`,
  `Home Address: "${CAPTURE_PATIENT.address}",`,
  `Emergency Contact Name and Phone: "${CAPTURE_PATIENT.emergencyContact}",`,
  `Active Conditions / Diagnoses: "${CAPTURE_PATIENT.conditions}",`,
  `Known Allergies: "${CAPTURE_PATIENT.allergies}",`,
  `Insurance Provider: "${CAPTURE_PATIENT.insurance}".`,
  `After entering all the details, click on register patient to save the record.`,
  `If the registration is successful, you should see a success notification on the page. If any error or validation message appears instead, address it accordingly.`,
].join(' ')

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const dbPath = path.resolve(__dirname, '../../meditrack-test.db')
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  const meditrack = createMediTrackServer(dbPath)
  ;({ server, origin } = await meditrack.start())
})

afterAll(done => {
  closeMediTrackDb()
  const dbPath = path.resolve(__dirname, '../../meditrack-test.db')
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  server.close(done)
})

beforeEach(() => { setupTestDb() })
afterEach(() => { teardownTestDb() })

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCaptureRunState(runId: string): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'capture', status: 'running',
    tenantId: 'tenant-fullcycle', currentStep: 0,
    isPaused: false, startedAt: now,
    log: {
      runId, type: 'capture', tenantId: 'tenant-fullcycle',
      goal: 'Add patient',
      startedAt: now, status: 'running', steps: []
    }
  }
}

function makeReplayRunState(runId: string, artifactId: string): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'replay', status: 'running',
    tenantId: 'tenant-fullcycle', artifactId,
    currentStep: 0, isPaused: false, startedAt: now,
    log: {
      runId, type: 'replay', artifactId,
      tenantId: 'tenant-fullcycle',
      goal: 'Replay add patient',
      startedAt: now, status: 'running', steps: []
    }
  }
}

function findSteps(steps: Step[], predicate: (s: Step) => boolean): Step[] {
  const results: Step[] = []
  for (const step of steps) {
    if (predicate(step)) results.push(step)
    if (step.innerSteps) results.push(...findSteps(step.innerSteps, predicate))
  }
  return results
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim()
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Add Patient — Capture → Replay full cycle', () => {

  itE2E('captures add-patient workflow then replays it end-to-end', async () => {

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 1: CAPTURE (dry run)
    // ══════════════════════════════════════════════════════════════════════

    const captureState = makeCaptureRunState('fullcycle-addpatient-capture')

    console.log('[test] ── PHASE 1: CAPTURE ──')
    console.log(`[test] goal: ${GOAL.slice(0, 120)}...`)
    await runDiscovery(captureState, GOAL, origin, 'tenant-fullcycle', [origin])

    console.log(`[test] capture status: ${captureState.status}, steps: ${captureState.log.steps.length}`)
    expect(captureState.status).toBe('success')
    expect(captureState.artifactId).toBeDefined()

    const artifact = findArtifactById(captureState.artifactId!, 'tenant-fullcycle')
    expect(artifact).toBeDefined()

    const allSteps = artifact!.steps
    console.log(`[test] artifact: ${allSteps.length} steps`)
    allSteps.forEach(s => {
      const mut = s.isMutating ? ' [MUTATING]' : ''
      const val = s.value && s.value !== '****' ? ` = "${s.value}"` : ''
      console.log(`  step ${s.stepNumber}: ${s.actionType} — "${s.description}"${val}${mut}`)
    })

    // Capture validations
    const inputSteps = findSteps(allSteps, s => s.actionType === 'input')
    expect(inputSteps.length).toBeGreaterThanOrEqual(6)

    const mutatingSteps = findSteps(allSteps, s => s.isMutating === true)
    expect(mutatingSteps.length).toBeGreaterThanOrEqual(1)
    for (const ms of mutatingSteps) {
      expect(ms.actionType).toBe('click')
    }

    expect(artifact!.allowWrites).toBe(true)

    const failedCaptureSteps = captureState.log.steps.filter(s => s.status === 'failed')
    expect(failedCaptureSteps.length).toBe(0)

    console.log('[test] ── CAPTURE PASSED ──')

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 2: REPLAY (execute for real)
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 2: REPLAY (with unseen patient data) ──')

    // Log the inputSchema so we can see what template variables were created
    console.log(`[test] artifact inputSchema:`)
    for (const [varName, info] of Object.entries(artifact!.inputSchema)) {
      console.log(`  {{${varName}}} — default: "${info.default}"`)
    }

    // Build replay inputs from REPLAY_PATIENT, mapping to the artifact's inputSchema keys
    // The variable names are derived from field descriptions (e.g. "firstName", "dateOfBirth")
    // We match by finding which schema key best matches each patient field
    const replayInputs: Record<string, string> = {}
    const schema = artifact!.inputSchema
    for (const [varName, info] of Object.entries(schema)) {
      const key = varName.toLowerCase()
      // Match schema variables to replay patient fields by keyword matching
      if (key.includes('first') && key.includes('name')) replayInputs[varName] = REPLAY_PATIENT.name.split(' ').slice(0, -1).join(' ')
      else if (key.includes('last') && key.includes('name')) replayInputs[varName] = REPLAY_PATIENT.name.split(' ').slice(-1)[0]
      else if (key.includes('date') || key.includes('birth') || key.includes('dob')) replayInputs[varName] = REPLAY_PATIENT.dob
      else if (key.includes('gender') || key.includes('sex')) replayInputs[varName] = REPLAY_PATIENT.gender
      else if (key.includes('ssn') || key.includes('social')) replayInputs[varName] = REPLAY_PATIENT.ssn
      else if (key.includes('phone') && !key.includes('emergency')) replayInputs[varName] = REPLAY_PATIENT.phone
      else if (key.includes('email')) replayInputs[varName] = REPLAY_PATIENT.email
      else if (key.includes('blood')) replayInputs[varName] = REPLAY_PATIENT.bloodType
      else if (key.includes('address') || key.includes('home')) replayInputs[varName] = REPLAY_PATIENT.address
      else if (key.includes('condition') || key.includes('diagnos')) replayInputs[varName] = REPLAY_PATIENT.conditions
      else if (key.includes('allerg')) replayInputs[varName] = REPLAY_PATIENT.allergies
      else if (key.includes('insurance') || key.includes('provider')) replayInputs[varName] = REPLAY_PATIENT.insurance
      else if (key.includes('emergency') && key.includes('name')) replayInputs[varName] = REPLAY_PATIENT.emergencyContact.replace(/\s*\(.*/, '')
      else if (key.includes('emergency') && key.includes('phone')) replayInputs[varName] = REPLAY_PATIENT.emergencyContact.match(/\(.*\)/)?.[0] ?? ''
      else {
        console.log(`[test] no match for schema var "${varName}" (default: "${info.default}") — using default`)
      }
    }

    console.log(`[test] replay inputs:`)
    for (const [k, v] of Object.entries(replayInputs)) {
      console.log(`  ${k}: "${v}"`)
    }

    const replayState = makeReplayRunState('fullcycle-addpatient-replay', captureState.artifactId!)

    await runReplay(replayState, artifact!, replayInputs)

    console.log(`[test] replay status: ${replayState.status}`)

    const replayStepLogs = replayState.log.steps
    console.log(`[test] replay step logs (${replayStepLogs.length}):`)
    replayStepLogs.forEach(s => {
      const err = s.errorDetails ? ` — ${s.errorDetails}` : ''
      console.log(`  step ${s.stepNumber}: ${s.status} (${s.elementStrategyUsed})${err}`)
    })

    // ── 1. Replay must succeed ──────────────────────────────────────────
    expect(replayState.status).toBe('success')

    // ── 2. All replay steps should have succeeded ────────────────────────
    const failedReplaySteps = replayStepLogs.filter(s => s.status === 'failed')
    console.log(`[test] failed replay steps: ${failedReplaySteps.length}`)
    expect(failedReplaySteps.length).toBe(0)

    // ── 3. Step count should match artifact ──────────────────────────────
    expect(replayStepLogs.length).toBe(allSteps.length)

    // ── 4. Element strategies — most should NOT be fallback ──────────────
    const strategies = {
      primary:   replayStepLogs.filter(s => s.elementStrategyUsed === 'primary').length,
      secondary: replayStepLogs.filter(s => s.elementStrategyUsed === 'secondary').length,
      tertiary:  replayStepLogs.filter(s => s.elementStrategyUsed === 'tertiary').length,
      fallback:  replayStepLogs.filter(s => s.elementStrategyUsed === 'fallback').length,
    }
    console.log(`[test] strategies: primary=${strategies.primary}, secondary=${strategies.secondary}, tertiary=${strategies.tertiary}, fallback=${strategies.fallback}`)

    const fallbackRatio = replayStepLogs.length > 0
      ? strategies.fallback / replayStepLogs.length
      : 0
    console.log(`[test] fallback ratio: ${(fallbackRatio * 100).toFixed(0)}%`)
    expect(fallbackRatio).toBeLessThan(0.5)

    // ── 5. Verify mutating step captured page state after execution ──────
    const mutatingLogs = replayStepLogs.filter(s => {
      const artifactStep = allSteps.find(as => as.stepNumber === s.stepNumber)
      return artifactStep?.isMutating
    })
    console.log(`[test] mutating step logs: ${mutatingLogs.length}`)
    expect(mutatingLogs.length).toBeGreaterThanOrEqual(1)

    for (const ml of mutatingLogs) {
      console.log(`[test] mutating step ${ml.stepNumber} page state: ${ml.pageStateAfter}`)
      expect(ml.pageStateAfter).toBeDefined()

      // Parse and check the page state contains a success signal
      const state = JSON.parse(ml.pageStateAfter!)
      console.log(`[test] page URL after submit: ${state.url}`)
      console.log(`[test] alerts found: ${state.alerts.length}`)
      state.alerts.forEach((a: string) => console.log(`  "${a.slice(0, 120)}"`))

      // Should have at least one alert/success message visible
      expect(state.alerts.length).toBeGreaterThanOrEqual(1)

      // The alert should mention the patient name or "success"/"registered"
      const allAlertText = state.alerts.join(' ').toLowerCase()
      const hasSuccessSignal =
        allAlertText.includes('success') ||
        allAlertText.includes('registered') ||
        allAlertText.includes('created') ||
        allAlertText.includes('saved')
      console.log(`[test] success signal in alerts: ${hasSuccessSignal}`)
      expect(hasSuccessSignal).toBe(true)
    }

    console.log('[test] ── FULL CYCLE PASSED ──')
  }, 1200000) // 20 min — capture + replay
})
