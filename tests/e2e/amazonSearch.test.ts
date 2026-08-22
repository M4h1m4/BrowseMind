/**
 * E2E Amazon Search — Capture + Replay
 *
 * Captures the search workflow on Amazon using one sample search term ("headset"),
 * then replays the artifact with 3 different search terms ("monitor", "keyboard",
 * "wireless mouse") to extract the title, price, and rating of the first result.
 *
 * Run: RUN_E2E=true npm run test:e2e -- --testPathPattern="amazonSearch"
 */

import fs from 'fs'
import path from 'path'
import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { runDiscovery } from '../../src/agent/discovery'
import { runReplay } from '../../src/replay/replay'
import { findArtifactById } from '../../src/artifact/repository'
import { RunState, Step } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

const AMAZON_URL = 'https://www.amazon.com'
const TENANT     = 'tenant-amazon'
const OUTPUT_PATH = 'out/amazon-search.csv'

// The capture goal — uses "headset" as the sample search term
const CAPTURE_GOAL = [
  `Go to Amazon.com and search for "headset" using the search bar.`,
  `From the search results page, extract the title, price, and rating of the very first product listing.`,
  `Save the result as a CSV file to ${OUTPUT_PATH} with columns for the search term, title, price, and rating.`,
].join(' ')

// Replay search terms — different items to prove the artifact generalises
const REPLAY_ITEMS = ['monitor', 'keyboard', 'wireless mouse']

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => { setupTestDb() })
afterEach(() => { teardownTestDb() })

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCaptureRunState(runId: string): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'capture', status: 'running',
    tenantId: TENANT, currentStep: 0,
    isPaused: false, startedAt: now,
    log: {
      runId, type: 'capture', tenantId: TENANT,
      goal: CAPTURE_GOAL,
      startedAt: now, status: 'running', steps: []
    }
  }
}

function makeReplayRunState(runId: string, artifactId: string): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'replay', status: 'running',
    tenantId: TENANT, artifactId,
    currentStep: 0, isPaused: false, startedAt: now,
    log: {
      runId, type: 'replay', artifactId, tenantId: TENANT,
      goal: 'Replay Amazon search',
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Amazon Search — Capture with "headset", Replay with other items', () => {

  itE2E('captures search workflow then replays with different search terms', async () => {

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 1: CAPTURE — search for "headset", extract first result
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 1: CAPTURE (search for "headset") ──')
    const captureState = makeCaptureRunState('amazon-capture-001')

    await runDiscovery(captureState, CAPTURE_GOAL, AMAZON_URL, TENANT, [AMAZON_URL])

    console.log(`[test] capture status: ${captureState.status}, steps: ${captureState.log.steps.length}`)
    expect(captureState.status).toBe('success')
    expect(captureState.artifactId).toBeDefined()

    const artifact = findArtifactById(captureState.artifactId!, TENANT)
    expect(artifact).toBeDefined()

    console.log(`[test] artifact: ${artifact!.steps.length} steps`)
    artifact!.steps.forEach(s => {
      const val = s.value ? ` = "${s.value}"` : ''
      console.log(`  step ${s.stepNumber}: ${s.actionType} — "${s.description}"${val}`)
    })

    // Should have input step (search bar), extract steps, and output step
    const inputSteps   = findSteps(artifact!.steps, s => s.actionType === 'input')
    const extractSteps = findSteps(artifact!.steps, s => s.actionType === 'extract')
    const outputSteps  = findSteps(artifact!.steps, s => s.actionType === 'output')

    console.log(`[test] input steps: ${inputSteps.length}, extract steps: ${extractSteps.length}, output steps: ${outputSteps.length}`)
    expect(inputSteps.length).toBeGreaterThanOrEqual(1)
    expect(extractSteps.length).toBeGreaterThanOrEqual(1)

    // The search term should be templatized in inputSchema
    console.log('[test] inputSchema:')
    for (const [varName, info] of Object.entries(artifact!.inputSchema)) {
      console.log(`  {{${varName}}} — default: "${info.default}"`)
    }

    console.log('[test] ── CAPTURE PASSED ──')

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 2: REPLAY — run with each search term
    // ══════════════════════════════════════════════════════════════════════

    // Find the input variable that holds the search term
    const searchVarEntry = Object.entries(artifact!.inputSchema).find(
      ([_, info]) => info.default?.toLowerCase() === 'headset'
    )
    const searchVarName = searchVarEntry?.[0]
    console.log(`[test] search variable: {{${searchVarName}}}`)
    expect(searchVarName).toBeDefined()

    for (const item of REPLAY_ITEMS) {
      console.log(`\n[test] ── REPLAY: searching for "${item}" ──`)

      const replayState = makeReplayRunState(`amazon-replay-${item.replace(/\s+/g, '-')}`, captureState.artifactId!)

      // Clean output file before each replay
      const outputFullPath = path.resolve(process.cwd(), OUTPUT_PATH)
      if (fs.existsSync(outputFullPath)) fs.unlinkSync(outputFullPath)

      const replayInputs: Record<string, string> = {
        [searchVarName!]: item
      }

      await runReplay(replayState, artifact!, replayInputs)

      console.log(`[test] replay status for "${item}": ${replayState.status}`)
      replayState.log.steps.forEach(s => {
        const err = s.errorDetails ? ` — ${s.errorDetails}` : ''
        console.log(`  step ${s.stepNumber}: ${s.status} (${s.elementStrategyUsed})${err}`)
      })

      expect(replayState.status).toBe('success')

      const failedSteps = replayState.log.steps.filter(s => s.status === 'failed')
      console.log(`[test] failed steps for "${item}": ${failedSteps.length}`)
      expect(failedSteps.length).toBe(0)

      // Check output file was produced
      if (fs.existsSync(outputFullPath)) {
        const raw = fs.readFileSync(outputFullPath, 'utf-8')
        console.log(`[test] output for "${item}":\n${raw}`)
      }
    }

    // Clean up
    const outputFullPath = path.resolve(process.cwd(), OUTPUT_PATH)
    if (fs.existsSync(outputFullPath)) fs.unlinkSync(outputFullPath)

    console.log('\n[test] ── AMAZON SEARCH TEST PASSED ──')
  }, 900000) // 15 min
})
