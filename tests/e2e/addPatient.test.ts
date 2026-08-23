/**
 * E2E Add Patient — Capture Phase Validation
 *
 * Tests that the capture phase correctly handles a write workflow:
 *   1. Navigates to the add patient form
 *   2. Fills all form fields (text inputs + select dropdowns) using ONE patient
 *   3. Flags the "Register Patient" click as isMutating (dry run — not executed)
 *   4. Produces an artifact with the correct structure
 *
 * Capture only needs ONE example to learn the workflow pattern.
 * Replay would execute the same workflow with different data (parameterized).
 *
 * Run: RUN_E2E=true npm run test:e2e -- --testPathPattern="addPatient"
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { runDiscovery } from '../../src/agent/discovery'
import { findArtifactById } from '../../src/artifact/repository'
import { RunState, Step } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

// ── Serve MediTrack mock website ─────────────────────────────────────────────

const MEDITRACK_DIR = path.resolve(__dirname, '../../mock-websites/meditrack')

let server: http.Server
let origin: string

function serveMediTrack(): Promise<{ server: http.Server; origin: string }> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const urlPath = (req.url ?? '/').split('?')[0]
      const filePath = urlPath === '/' ? '/index.html' : urlPath
      const fullPath = path.join(MEDITRACK_DIR, filePath)
      const ext = path.extname(fullPath).toLowerCase()

      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.css':  'text/css',
        '.js':   'application/javascript',
        '.json': 'application/json',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
      }

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not Found')
          return
        }
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' })
        res.end(data)
      })
    })

    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number }
      resolve({ server: srv, origin: `http://127.0.0.1:${port}` })
    })

    srv.on('error', reject)
  })
}

// ── Patient data — ONE patient for capture to learn the workflow ──────────────

const PATIENT = {
  name:             'William H. Carter',
  dob:              '1983-06-14',
  gender:           'Male',
  phone:            '(617) 555-3201',
  email:            'w.carter@email.com',
  bloodType:        'O-',
  address:          '45 Beacon Street, Boston, MA 02108',
  conditions:       'Asthma',
  allergies:        'None known',
  insurance:        'Cigna',
  emergencyContact: 'Sarah Carter (617) 555-3202',
}

const GOAL = [
  'Go to the patients tab and click on add patient.',
  `Fill in the following details:`,
  `Name: "${PATIENT.name}", Date of Birth: "${PATIENT.dob}", Gender: "${PATIENT.gender}",`,
  `Phone: "${PATIENT.phone}", Email: "${PATIENT.email}", Blood Type: "${PATIENT.bloodType}",`,
  `Address: "${PATIENT.address}", Conditions: "${PATIENT.conditions}",`,
  `Allergies: "${PATIENT.allergies}", Insurance Provider: "${PATIENT.insurance}",`,
  `Emergency Contact: "${PATIENT.emergencyContact}".`,
  `After entering all the details, click on register patient to save the record.`,
].join(' ')

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  ;({ server, origin } = await serveMediTrack())
})

afterAll(done => {
  server.close(done)
})

beforeEach(() => { setupTestDb() })
afterEach(() => { teardownTestDb() })

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCaptureRunState(runId: string): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'capture', status: 'running',
    tenantId: 'tenant-addpatient', currentStep: 0,
    isPaused: false, startedAt: now,
    log: {
      runId, type: 'capture', tenantId: 'tenant-addpatient',
      goal: 'Add patient',
      startedAt: now, status: 'running', steps: []
    }
  }
}

/** Recursively find all steps matching a predicate */
function findSteps(steps: Step[], predicate: (s: Step) => boolean): Step[] {
  const results: Step[] = []
  for (const step of steps) {
    if (predicate(step)) results.push(step)
    if (step.innerSteps) results.push(...findSteps(step.innerSteps, predicate))
  }
  return results
}

/** Normalize a string for fuzzy comparison */
function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim()
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Add Patient — Capture phase', () => {

  itE2E('captures the add-patient workflow with correct form fields and dry-run mutating steps', async () => {
    const state = makeCaptureRunState('addpatient-capture-001')

    console.log('[test] ── CAPTURE PHASE (dry run) ──')
    console.log(`[test] goal: ${GOAL.slice(0, 120)}...`)
    await runDiscovery(state, GOAL, origin, 'tenant-addpatient', [origin])

    // ── 1. Capture must succeed ─────────────────────────────────────────
    console.log(`[test] capture status: ${state.status}, steps: ${state.log.steps.length}`)
    expect(state.status).toBe('success')
    expect(state.artifactId).toBeDefined()
    console.log(`[test] artifactId: ${state.artifactId}`)

    // ── 2. Load and inspect the artifact ────────────────────────────────
    const artifact = findArtifactById(state.artifactId!, 'tenant-addpatient')
    expect(artifact).toBeDefined()

    const allSteps = artifact!.steps
    console.log(`[test] artifact has ${allSteps.length} top-level steps:`)
    allSteps.forEach(s => {
      const mut = s.isMutating ? ' [MUTATING]' : ''
      const val = s.value && s.value !== '****' ? ` = "${s.value}"` : ''
      console.log(`  step ${s.stepNumber}: ${s.actionType} — "${s.description}"${val}${mut}`)
    })

    // ── 3. Must have input steps (form filling) ─────────────────────────
    const inputSteps = findSteps(allSteps, s => s.actionType === 'input')
    console.log(`[test] input steps: ${inputSteps.length}`)
    // One patient has ~11 fields (name may split into first+last).
    // The LLM may skip optional fields, but should fill at least the key ones.
    expect(inputSteps.length).toBeGreaterThanOrEqual(6)

    // ── 4. Input steps should NOT be flagged as mutating ────────────────
    const mutatingInputs = inputSteps.filter(s => s.isMutating === true)
    console.log(`[test] input steps flagged mutating: ${mutatingInputs.length}`)
    expect(mutatingInputs.length).toBe(0)

    // ── 5. Must have at least one mutating step (Register Patient) ──────
    const mutatingSteps = findSteps(allSteps, s => s.isMutating === true)
    console.log(`[test] mutating steps: ${mutatingSteps.length}`)
    mutatingSteps.forEach(s =>
      console.log(`  step ${s.stepNumber}: ${s.actionType} — "${s.description}"`)
    )
    expect(mutatingSteps.length).toBeGreaterThanOrEqual(1)

    // Mutating steps should be click actions (submit/register buttons)
    for (const ms of mutatingSteps) {
      expect(ms.actionType).toBe('click')
    }

    // ── 6. Input values should contain actual patient data ──────────────
    const inputValues = findSteps(allSteps, s => s.actionType === 'input')
      .map(s => s.value ?? '')
      .filter(v => v.length > 0 && v !== '****')

    console.log(`[test] input values (${inputValues.length}):`)
    inputValues.forEach(v => console.log(`  "${v}"`))

    // Build all possible patient data fragments for matching
    // Name may be split into first/last, so include individual parts
    const nameParts = PATIENT.name.split(' ').map(normalize)
    const patientDataFragments = [
      ...nameParts,
      normalize(PATIENT.phone),
      normalize(PATIENT.email),
      normalize(PATIENT.address),
      normalize(PATIENT.conditions),
      normalize(PATIENT.allergies),
    ]

    // Count how many input values match some patient data
    const matchingValues = inputValues.filter(v => {
      const nv = normalize(v)
      return patientDataFragments.some(pd => nv.includes(pd) || pd.includes(nv))
    })
    console.log(`[test] input values matching patient data: ${matchingValues.length}/${inputValues.length}`)
    expect(matchingValues.length).toBeGreaterThanOrEqual(3)

    // ── 7. Dropdown fields should have been set correctly ───────────────
    // Gender, Blood Type, Insurance are <select> fields — they should
    // appear as input steps with the correct values
    const selectValues = [
      normalize(PATIENT.gender),
      normalize(PATIENT.bloodType),
      normalize(PATIENT.insurance),
    ]
    const normalizedInputValues = inputValues.map(normalize)

    const matchedSelects = selectValues.filter(sv =>
      normalizedInputValues.some(iv => iv.includes(sv) || sv.includes(iv))
    )
    console.log(`[test] dropdown values matched: ${matchedSelects.length}/3 (${matchedSelects.join(', ')})`)
    // At least gender and insurance should have been captured
    expect(matchedSelects.length).toBeGreaterThanOrEqual(2)

    // ── 8. Should have navigation clicks (non-mutating) ─────────────────
    const navClicks = findSteps(allSteps, s =>
      s.actionType === 'click' && !s.isMutating
    )
    console.log(`[test] non-mutating clicks: ${navClicks.length}`)
    expect(navClicks.length).toBeGreaterThanOrEqual(1)

    // ── 9. Artifact should have allowWrites = true ──────────────────────
    expect(artifact!.allowWrites).toBe(true)

    // ── 10. No step should have failed in the run log ───────────────────
    const failedRunSteps = state.log.steps.filter(s => s.status === 'failed')
    console.log(`[test] failed run steps: ${failedRunSteps.length}`)
    expect(failedRunSteps.length).toBe(0)

    // ── 11. Dump full artifact for verification ──────────────────────
    console.log('[test] ── FULL ARTIFACT DUMP ──')
    console.log(JSON.stringify(artifact, null, 2))

    console.log('[test] ── CAPTURE PHASE PASSED ──')
  }, 420000) // 7 min — one patient × ~13 fields + navigation + LLM calls
})
