/**
 * E2E Full Cycle — Capture + Replay + Output Correctness
 *
 * Serves the MediTrack mock website, runs the FULL pipeline:
 *   1. Capture phase — LLM discovers the workflow from natural language
 *   2. Replay phase  — replays the captured artifact against the same site
 *   3. Correctness   — validates the output file against the real MediTrack data
 *
 * Expected data is read dynamically from mockwebsites/meditrack/data.js —
 * nothing is hardcoded.
 *
 * Run: RUN_E2E=true npm run test:e2e -- --testPathPattern="fullCycle"
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { runDiscovery } from '../../src/agent/discovery'
import { runReplay } from '../../src/replay/replay'
import { findArtifactById } from '../../src/artifact/repository'
import { RunState, Artifact, Step } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

// ── Serve MediTrack mock website ─────────────────────────────────────────────

const MEDITRACK_DIR = path.resolve(__dirname, '../../mockwebsites/meditrack')

let server: http.Server
let origin: string

function serveMediTrack(): Promise<{ server: http.Server; origin: string }> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      // Preserve query string for patient-detail.html?id=P001
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

// ── Read expected data from MediTrack data.js ────────────────────────────────

interface PatientData {
  id:         string
  name:       string
  conditions: string[]
}

/**
 * Parse the MediTrack data.js file to extract the expected patient data.
 * The dashboard shows `patients.slice(-5).reverse()` — the last 5 patients in
 * reverse order. This function returns that same set.
 *
 * Handles JS strings with escaped apostrophes (e.g. 'Parkinson\'s Disease').
 */
function getExpectedRecentPatients(): PatientData[] {
  const dataJs = fs.readFileSync(path.join(MEDITRACK_DIR, 'data.js'), 'utf-8')

  const patients: PatientData[] = []

  // Use a regex that handles escaped quotes inside JS string literals
  // Match: id: 'P001', name: 'Some Name',
  const idNamePattern = /id:\s*'(P\d+)',\s*name:\s*'((?:[^'\\]|\\.)*)'/g
  let match: RegExpExecArray | null

  while ((match = idNamePattern.exec(dataJs)) !== null) {
    const id = match[1]
    // Unescape JS string (e.g. \' → ')
    const name = match[2].replace(/\\'/g, "'")

    // Find the conditions array after this id/name
    const afterMatch = dataJs.slice(match.index)
    const condArrayMatch = afterMatch.match(/conditions:\s*\[([\s\S]*?)\]/)
    let conditions: string[] = []
    if (condArrayMatch) {
      // Parse each string in the array, handling escaped quotes
      const condStr = condArrayMatch[1]
      const condPattern = /'((?:[^'\\]|\\.)*)'/g
      let condMatch: RegExpExecArray | null
      while ((condMatch = condPattern.exec(condStr)) !== null) {
        conditions.push(condMatch[1].replace(/\\'/g, "'"))
      }
    }

    patients.push({ id, name, conditions })
  }

  // Dashboard shows last 5, reversed
  return patients.slice(-5).reverse()
}

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
    tenantId: 'tenant-fullcycle', currentStep: 0,
    isPaused: false, startedAt: now,
    log: {
      runId, type: 'capture', tenantId: 'tenant-fullcycle',
      goal: 'Extract patient names and active conditions',
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
      goal: 'Replay patient extraction',
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

/**
 * Normalize a string for fuzzy comparison — lowercase, collapse whitespace,
 * strip common punctuation differences.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim()
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Full cycle — Capture → Replay → Output correctness', () => {
  itE2E('captures an artifact then replays it, producing correct patient data', async () => {
    const expectedPatients = getExpectedRecentPatients()
    console.log(`[test] expected ${expectedPatients.length} patients from data.js:`)
    expectedPatients.forEach(p =>
      console.log(`  ${p.id}: ${p.name} — [${p.conditions.join(', ')}]`)
    )

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 1: CAPTURE
    // ══════════════════════════════════════════════════════════════════════

    const captureState = makeCaptureRunState('fullcycle-capture-001')
    const goal = 'On the dashboard, find the recent patients table and for every patient click on the view button and extract their names and their active conditions.'

    console.log('[test] ── PHASE 1: CAPTURE ──')
    await runDiscovery(captureState, goal, origin, 'tenant-fullcycle', [origin])

    // Capture must succeed
    expect(captureState.status).toBe('success')
    expect(captureState.artifactId).toBeDefined()
    console.log(`[test] capture succeeded — artifactId: ${captureState.artifactId}`)

    // Load the artifact
    const artifact = findArtifactById(captureState.artifactId!, 'tenant-fullcycle')
    expect(artifact).toBeDefined()

    // Artifact must have a loop step
    const loopSteps = findSteps(artifact!.steps, s => s.actionType === 'loop')
    expect(loopSteps.length).toBeGreaterThanOrEqual(1)

    // Artifact must have an output step with an outputPath.
    // The LLM may emit incomplete output steps first (missing outputPath) —
    // our guard forces retry. Find the one that has outputPath set.
    const outputSteps = findSteps(artifact!.steps, s => s.actionType === 'output')
    expect(outputSteps.length).toBeGreaterThanOrEqual(1)
    const outputStep = outputSteps.find(s => s.outputPath) ?? outputSteps[outputSteps.length - 1]
    expect(outputStep.outputPath).toBeDefined()

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 2: REPLAY
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 2: REPLAY ──')
    const replayState = makeReplayRunState('fullcycle-replay-001', captureState.artifactId!)

    // Clean up any output file from a previous run
    const outputPath = path.resolve(process.cwd(), outputStep.outputPath!)
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)

    await runReplay(replayState, artifact!, {})

    // Replay must succeed
    expect(replayState.status).toBe('success')
    console.log(`[test] replay succeeded — ${replayState.log.steps.length} step logs`)

    // Output file must exist
    expect(fs.existsSync(outputPath)).toBe(true)
    console.log(`[test] output file: ${outputPath}`)

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 3: CORRECTNESS — validate output against real MediTrack data
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 3: CORRECTNESS ──')

    const rawOutput = fs.readFileSync(outputPath, 'utf-8')
    let outputRows: Record<string, string>[]

    if (outputStep.outputFormat === 'csv') {
      // Parse CSV: first line is headers, rest are data
      const lines = rawOutput.split('\n').filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim())
      outputRows = lines.slice(1).map(line => {
        // Handle quoted CSV fields
        const values: string[] = []
        let current = ''
        let inQuote = false
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote; continue }
          if (ch === ',' && !inQuote) { values.push(current.trim()); current = ''; continue }
          current += ch
        }
        values.push(current.trim())

        const row: Record<string, string> = {}
        headers.forEach((h, i) => { row[h] = values[i] ?? '' })
        return row
      })
    } else {
      outputRows = JSON.parse(rawOutput)
    }

    console.log(`[test] output has ${outputRows.length} rows`)
    outputRows.forEach((row, i) => console.log(`  row ${i}: ${JSON.stringify(row)}`))

    // ── 3a. Row count should match the number of recent patients ─────────
    // The dashboard shows 5 patients. Replay should have extracted all 5.
    expect(outputRows.length).toBe(expectedPatients.length)

    // ── 3b. Identify which output columns hold names vs conditions ───────
    // We don't hardcode column names — discover them from the output fields.
    const outputFields = outputStep.outputFields ?? []

    // Find the "name" column and "conditions" column by matching field
    // variable names to likely patterns
    const nameField = outputFields.find(f => {
      const v = f.variable.toLowerCase()
      return v.includes('name') && !v.includes('condition')
    })
    const condField = outputFields.find(f => {
      const v = f.variable.toLowerCase()
      return v.includes('condition')
    })

    console.log(`[test] name column: "${nameField?.header}" (${nameField?.variable})`)
    console.log(`[test] conditions column: "${condField?.header}" (${condField?.variable})`)

    // At least one of these should exist for the test to be meaningful
    expect(nameField || condField).toBeDefined()

    // ── 3c. Validate patient names ───────────────────────────────────────
    if (nameField) {
      const extractedNames = outputRows.map(r => normalize(r[nameField.header] ?? ''))
      const expectedNames  = expectedPatients.map(p => normalize(p.name))

      console.log('[test] extracted names:', extractedNames)
      console.log('[test] expected names: ', expectedNames)

      // Each expected name should appear in the extracted output.
      // The extracted name may include extra text like a blood type badge
      // (e.g. "Frances J. Kowalski AB+") — so we check containment.
      for (const expected of expectedNames) {
        const found = extractedNames.some(extracted => extracted.includes(expected))
        if (!found) {
          console.log(`[test] name not found: "${expected}" in`, extractedNames)
        }
        expect(found).toBe(true)
      }

      // No extracted name should be empty
      for (const name of extractedNames) {
        expect(name.length).toBeGreaterThan(0)
      }

      // Names should look like real names (not entire page sections)
      for (const name of extractedNames) {
        expect(name.length).toBeLessThan(100)
        // Should not contain HTML or page structure text
        expect(name).not.toContain('<')
        expect(name).not.toContain('meditrack')
        expect(name).not.toContain('dashboard')
      }
    }

    // ── 3d. Validate conditions ──────────────────────────────────────────
    if (condField) {
      const extractedConditions = outputRows.map(r => normalize(r[condField.header] ?? ''))

      console.log('[test] extracted conditions:', extractedConditions)

      for (let i = 0; i < expectedPatients.length; i++) {
        const expectedConds = expectedPatients[i].conditions
        const extracted = extractedConditions[i] ?? ''

        // Each expected condition should appear somewhere in the extracted text
        // (conditions may be comma-separated, badge text, etc.)
        for (const cond of expectedConds) {
          const normalizedCond = normalize(cond)
          expect(extracted).toContain(normalizedCond)
        }

        // Conditions text should be reasonably sized (not an entire page dump)
        expect(extracted.length).toBeLessThan(500)
        expect(extracted.length).toBeGreaterThan(0)

        // Should not contain unrelated page text
        expect(extracted).not.toContain('meditrack')
        expect(extracted).not.toContain('book appointment')
      }
    }

    // ── 3e. Replay step logs should show no fallback-only strategies ─────
    // If every step fell back to raw coordinates, the artifact is fragile.
    const replayStepLogs = replayState.log.steps
    const fallbackOnly = replayStepLogs.filter(s => s.elementStrategyUsed === 'fallback')
    const totalSteps = replayStepLogs.length
    const fallbackRatio = totalSteps > 0 ? fallbackOnly.length / totalSteps : 0

    console.log(`[test] replay strategies: ${totalSteps} steps, ${fallbackOnly.length} used fallback (${(fallbackRatio * 100).toFixed(0)}%)`)

    // At most 50% of steps should use fallback — ideally much less
    expect(fallbackRatio).toBeLessThan(0.5)

    // ── 3f. No replay steps should have failed ──────────────────────────
    const failedSteps = replayStepLogs.filter(s => s.status === 'failed')
    expect(failedSteps.length).toBe(0)

    // Clean up output file
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)

    console.log('[test] ── FULL CYCLE PASSED ──')
  }, 300000) // 5 min — capture + replay both involve LLM calls and browser automation
})
