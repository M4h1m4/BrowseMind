/**
 * E2E Notes — Work Category Extraction on a REAL website
 *
 * Target: https://practice.expandtesting.com/notes/app  (ExpandTesting's public
 * automation-practice app — real backend, real persistence, published for this
 * exact purpose).
 *
 * ── Session handling ────────────────────────────────────────────────────────
 * No credentials appear in this file, in the goal, or in .env. The run uses the
 * system's designed login path:
 *
 *   1. Capture opens a visible browser and hits the login wall.
 *   2. The LLM returns requiresLogin → status becomes 'login_required' and the
 *      run pauses on waitForResume()               (discovery.ts:950)
 *   3. A HUMAN logs in by hand in that browser window.
 *   4. Resume fires → captureAndStoreAuthState() stores cookies + localStorage
 *      keyed by hostname                            (loginHandler.ts:4)
 *   5. Replay injects that state and starts already authenticated
 *                                                   (replay.ts:413)
 *
 * In production the resume comes from POST /api/v1/runs/{runId}/resume. Here a
 * timer fires signalResume() after LOGIN_WAIT_MS, matching phase6.test.ts.
 *
 * ── Oracle ──────────────────────────────────────────────────────────────────
 * The site is live, so expected data cannot be hardcoded. After capture we
 * scrape the Work category with a plain Playwright session that reuses the same
 * stored auth state. That scrape imports none of the agent's element-location or
 * extraction code — if oracle and agent shared those helpers, a bug in the
 * shared part would cancel out and the test would pass while both were wrong.
 *
 * ── Contract under test ─────────────────────────────────────────────────────
 *   CAPTURE previews the loop on note 1 only        (discovery.ts:721)
 *   REPLAY  iterates every matching row             (replay.ts:95)
 * so an N-row output from a 1-row capture is the proof that one sample
 * generalised.
 *
 * Read-only: clicks and extracts, never creates/edits/deletes. Safe to re-run.
 *
 * Run: RUN_E2E=true LOGIN_WAIT_MS=45000 npm run test:e2e -- --testPathPattern="notesWorkCategory"
 */

import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'
import 'dotenv/config'
import { setupTestDb, teardownTestDb } from '../helpers/db'
import { runDiscovery } from '../../src/agent/discovery'
import { runReplay } from '../../src/replay/replay'
import { findArtifactById } from '../../src/artifact/repository'
import { signalResume, resetSignals } from '../../src/session/resumeSignal'
import { getAuthState, clearAllAuthState } from '../../src/session/authStore'
import { RunState, Step } from '../../src/types'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

const NOTES_URL     = process.env.NOTES_URL ?? 'https://practice.expandtesting.com/notes/app'
const ORIGIN        = new URL(NOTES_URL).origin
const DOMAIN        = new URL(NOTES_URL).hostname
const LOGIN_WAIT_MS = parseInt(process.env.LOGIN_WAIT_MS ?? '45000')

const TENANT      = 'tenant-notes'
const OUTPUT_PATH = 'out/notes-work.csv'

// ── The natural-language goal handed to the agent ────────────────────────────
// Login is deliberately absent: the agent hits the wall, pauses, and a human
// resolves it. Every field requested is reachable through textContent.
//
// Per-note completion status is NOT requested. The completion checkbox carries
// its state as a DOM *property*, and extract() only supports getAttribute() or
// textContent() (replay.ts:87-89), so `checked` would come back null whether or
// not the box is ticked.

const GOAL = [
  `On the MyNotes dashboard, click on the Work category filter.`,
  `Then, for every note listed under the Work category, click its View button and`,
  `extract the note's title and the date and time it was created.`,
  `Do this for all the notes under the Work category.`,
  `Save the collected results as a CSV file to ${OUTPUT_PATH} with a column for the`,
  `title and a column for the created date and time.`,
].join(' ')

// ── Ground truth ─────────────────────────────────────────────────────────────

interface ExpectedNote {
  title:   string
  created: string   // e.g. "August 20, 2026 at 23:04:49"
}

/** Matches the card timestamp format, e.g. "August 20, 2026 at 23:04:49" */
const DATE_RE = /[A-Z][a-z]+ \d{1,2}, \d{4} at \d{1,2}:\d{2}:\d{2}/

/**
 * Scrape the Work category using the auth state captured during the human
 * login — the same mechanism replay uses, so no credentials are needed here.
 */
async function scrapeWorkNotes(): Promise<ExpectedNote[]> {
  const auth = getAuthState(DOMAIN)
  if (!auth) throw new Error(`no stored auth state for ${DOMAIN} — did the login step run?`)

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await context.addCookies(auth.cookies)
    await context.addInitScript((ls: Record<string, string>) => {
      for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v)
    }, auth.localStorage)

    const page = await context.newPage()
    await page.goto(NOTES_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(3000)

    if (page.url().includes('/login')) {
      throw new Error('oracle landed on the login page — stored auth state did not authenticate')
    }

    await page.locator('button:has-text("Work"), a:has-text("Work")').first().click()
    await page.waitForTimeout(2500)

    return await page.evaluate((dateSrc: string) => {
      const dateRe = new RegExp(dateSrc)
      // A note card is any container holding a View control.
      const all = Array.from(document.querySelectorAll<HTMLElement>('div'))
      const cards = all.filter(el =>
        Array.from(el.querySelectorAll('a,button')).some(b => b.textContent?.trim() === 'View')
      )
      // Keep the innermost such containers, dropping the wrappers around them.
      const innermost = cards.filter(c => !cards.some(other => other !== c && c.contains(other)))

      return innermost.map(c => {
        const header = c.querySelector('.card-header, h4, h5, h6')
        const text   = c.innerText ?? ''
        const dm     = text.match(dateRe)
        return {
          title:   header?.textContent?.trim() ?? text.split('\n')[0]?.trim() ?? '',
          created: dm ? dm[0] : '',
        }
      }).filter(n => n.title.length > 0)
    }, DATE_RE.source)
  } finally {
    await browser.close()
  }
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  setupTestDb()
  resetSignals()
  clearAllAuthState()
})

afterEach(() => {
  teardownTestDb()
  resetSignals()
  clearAllAuthState()
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCaptureRunState(runId: string): RunState {
  const now = new Date().toISOString()
  return {
    runId, type: 'capture', status: 'running',
    tenantId: TENANT, currentStep: 0,
    isPaused: false, startedAt: now,
    log: {
      runId, type: 'capture', tenantId: TENANT,
      goal: 'Extract Work-category note titles and creation timestamps',
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
      goal: 'Replay Work-category note extraction',
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

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim()
}

/** Parse a CSV file into rows keyed by header, honouring quoted fields. */
function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.split('\n').filter(l => l.trim())
  if (lines.length === 0) return []

  const splitRow = (line: string): string[] => {
    const values: string[] = []
    let current = ''
    let inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue }
      if (ch === ',' && !inQuote) { values.push(current.trim()); current = ''; continue }
      current += ch
    }
    values.push(current.trim())
    return values
  }

  const headers = splitRow(lines[0])
  return lines.slice(1).map(line => {
    const values = splitRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Notes (real site) — Work category: capture → replay → correctness', () => {

  itE2E('captures the Work-category extraction from one sample, then replays it across every note', async () => {

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 1: CAPTURE — pauses for human login, previews the loop on note 1
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 1: CAPTURE ──')
    const captureState = makeCaptureRunState('notes-work-capture-001')

    console.log(`
┌──────────────────────────────────────────────────────────────────┐
│  A browser is opening on the MyNotes app.                        │
│  Log in BY HAND when the run pauses at 'login_required'.          │
│  You have ${String(LOGIN_WAIT_MS / 1000).padEnd(3)} seconds, then resume fires automatically.   │
│  No credentials are stored by this test.                          │
└──────────────────────────────────────────────────────────────────┘`)

    const timer = setTimeout(() => {
      console.log(`[test] firing resume signal for run ${captureState.runId}`)
      signalResume(captureState.runId)
    }, LOGIN_WAIT_MS)

    try {
      await runDiscovery(captureState, GOAL, NOTES_URL, TENANT, [ORIGIN])
    } finally {
      clearTimeout(timer)
    }

    console.log(`[test] capture status: ${captureState.status}, steps: ${captureState.log.steps.length}`)
    expect(captureState.status).toBe('success')
    expect(captureState.artifactId).toBeDefined()

    // ── 1a. The login intervention path actually ran ─────────────────────
    // Auth state is only ever written by captureAndStoreAuthState(), which is
    // reachable only through the requiresLogin → pause → resume path. Its
    // presence proves the human-login design was exercised rather than
    // credentials being smuggled in some other way.
    const auth = getAuthState(DOMAIN)
    console.log(`[test] auth state: ${auth ? `${auth.cookies.length} cookies, ${Object.keys(auth.localStorage).length} localStorage keys` : 'NONE'}`)
    expect(auth).toBeDefined()
    expect(auth!.cookies.length + Object.keys(auth!.localStorage).length).toBeGreaterThan(0)

    const artifact = findArtifactById(captureState.artifactId!, TENANT)
    expect(artifact).toBeDefined()

    artifact!.steps.forEach(s => {
      const val = s.value && s.value !== '****' ? ` = "${s.value}"` : ''
      console.log(`  step ${s.stepNumber}: ${s.actionType} — "${s.description}"${val}`)
    })

    // ── 1b. The workflow was generalised into a loop ─────────────────────
    // Without a loop the agent merely hardcoded note 1 and the
    // "one sample → many rows" contract does not hold.
    const loopSteps = findSteps(artifact!.steps, s => s.actionType === 'loop')
    expect(loopSteps.length).toBeGreaterThanOrEqual(1)
    expect(loopSteps[0].loopSelector).toBeTruthy()
    console.log(`[test] loopSelector: "${loopSteps[0].loopSelector}"`)

    // ── 1c. Extraction happens inside the loop, once per note ────────────
    const extractSteps = findSteps(artifact!.steps, s => s.actionType === 'extract')
    expect(extractSteps.length).toBeGreaterThanOrEqual(2)   // title + created
    extractSteps.forEach(s =>
      console.log(`  extract → ${s.variableName} via "${s.cssSelector}"${s.attribute ? ` [@${s.attribute}]` : ''}`)
    )

    // ── 1d. An output step with a destination ────────────────────────────
    const outputSteps = findSteps(artifact!.steps, s => s.actionType === 'output')
    expect(outputSteps.length).toBeGreaterThanOrEqual(1)
    const outputStep = outputSteps.find(s => s.outputPath) ?? outputSteps[outputSteps.length - 1]
    expect(outputStep.outputPath).toBeDefined()
    console.log(`[test] output → ${outputStep.outputPath} (${outputStep.outputFormat})`)

    // ── 1e. Read-only workflow: nothing flagged mutating ─────────────────
    const mutating = findSteps(artifact!.steps, s => s.isMutating === true)
    console.log(`[test] mutating steps: ${mutating.length} (expected 0 — this workflow only reads)`)
    expect(mutating.length).toBe(0)

    // ── 1f. The artifact carries no typed-in credentials ─────────────────
    // Login happened in the human's hands, so no input step should be
    // populating an email or password field.
    const credSteps = findSteps(artifact!.steps, s =>
      s.actionType === 'input' && /password|e-?mail|username|login/i.test(s.description)
    )
    console.log(`[test] credential-ish input steps in artifact: ${credSteps.length} (expected 0)`)
    expect(credSteps.length).toBe(0)

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 1.5: ORACLE — independent read of the Work category
    // ══════════════════════════════════════════════════════════════════════

    const expectedNotes = await scrapeWorkNotes()
    console.log(`[test] oracle found ${expectedNotes.length} notes in the Work category:`)
    expectedNotes.forEach(n => console.log(`   - "${n.title}"  (${n.created})`))

    // An empty category would make every assertion below vacuous and let a
    // broken agent pass.
    expect(expectedNotes.length).toBeGreaterThan(0)

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 2: REPLAY — injects the stored session, iterates every note
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 2: REPLAY ──')
    const replayState = makeReplayRunState('notes-work-replay-001', captureState.artifactId!)

    const outputPath = path.resolve(process.cwd(), outputStep.outputPath!)
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)

    await runReplay(replayState, artifact!, {})

    console.log(`[test] replay status: ${replayState.status}`)
    replayState.log.steps.forEach(s => {
      const err = s.errorDetails ? ` — ${s.errorDetails}` : ''
      console.log(`  step ${s.stepNumber}: ${s.status} (${s.elementStrategyUsed})${err}`)
    })

    expect(replayState.status).toBe('success')
    expect(replayState.log.steps.filter(s => s.status === 'failed').length).toBe(0)
    expect(fs.existsSync(outputPath)).toBe(true)

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 3: CORRECTNESS — compare against the oracle
    // ══════════════════════════════════════════════════════════════════════

    console.log('[test] ── PHASE 3: CORRECTNESS ──')

    const raw  = fs.readFileSync(outputPath, 'utf-8')
    const rows = outputStep.outputFormat === 'csv' ? parseCsv(raw) : JSON.parse(raw)

    console.log(`[test] output has ${rows.length} rows (oracle expected ${expectedNotes.length}):`)
    rows.forEach((r: Record<string, string>, i: number) =>
      console.log(`  row ${i}: ${JSON.stringify(r)}`)
    )

    // ── 3a. One captured sample produced every note ──────────────────────
    // Capture only ever previewed note 1, yet replay emitted all of them.
    expect(rows.length).toBe(expectedNotes.length)

    // ── 3b. Locate the title and created columns from the artifact ───────
    // Column names come from the LLM, so discover them rather than hardcode.
    const fields = outputStep.outputFields ?? []
    const titleField = fields.find(f => /title|name|note/i.test(f.variable))
    const dateField  = fields.find(f => /date|created|time|timestamp/i.test(f.variable))

    console.log(`[test] title column: "${titleField?.header}" (${titleField?.variable})`)
    console.log(`[test] date  column: "${dateField?.header}" (${dateField?.variable})`)
    expect(titleField).toBeDefined()
    expect(dateField).toBeDefined()

    // ── 3c. Every expected title appears in the output ───────────────────
    const extractedTitles = rows.map((r: Record<string, string>) => normalize(r[titleField!.header] ?? ''))
    for (const note of expectedNotes) {
      const want  = normalize(note.title)
      const found = extractedTitles.some((t: string) => t.includes(want) || want.includes(t))
      if (!found) console.log(`[test] title not found: "${want}" in ${JSON.stringify(extractedTitles)}`)
      expect(found).toBe(true)
    }

    // ── 3d. Titles are clean values, not page dumps ──────────────────────
    for (const t of extractedTitles) {
      expect(t.length).toBeGreaterThan(0)
      expect(t.length).toBeLessThan(200)
      expect(t).not.toContain('<')
      expect(t).not.toContain('mynotes')
      expect(t).not.toContain('add note')
    }

    // ── 3e. Every created timestamp is a real timestamp, and matches ─────
    const extractedDates = rows.map((r: Record<string, string>) => (r[dateField!.header] ?? '').trim())
    for (const d of extractedDates) {
      expect(d.length).toBeGreaterThan(0)
      expect(d).toMatch(DATE_RE)
    }

    for (const want of expectedNotes.map(n => n.created).filter(d => d.length > 0)) {
      const found = extractedDates.some((d: string) => normalize(d).includes(normalize(want)))
      if (!found) console.log(`[test] date not found: "${want}" in ${JSON.stringify(extractedDates)}`)
      expect(found).toBe(true)
    }

    // ── 3f. Title/date pairs stay aligned ────────────────────────────────
    // A loop that extracted into the wrong row would still satisfy 3c and 3e
    // individually, so check the pairing too.
    for (const note of expectedNotes) {
      if (!note.created) continue
      const row = rows.find((r: Record<string, string>) =>
        normalize(r[titleField!.header] ?? '').includes(normalize(note.title))
      )
      expect(row).toBeDefined()
      expect(normalize(row![dateField!.header] ?? '')).toContain(normalize(note.created))
    }

    // ── 3g. Element anchoring held up on a real site ─────────────────────
    // Falling back to raw coordinates everywhere means the artifact is
    // coordinate-bound and would break on any layout shift.
    const logs = replayState.log.steps
    const fallbacks = logs.filter(s => s.elementStrategyUsed === 'fallback').length
    const ratio = logs.length > 0 ? fallbacks / logs.length : 0
    console.log(`[test] strategies: ${logs.length} steps, ${fallbacks} fallback (${(ratio * 100).toFixed(0)}%)`)
    expect(ratio).toBeLessThan(0.5)

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    console.log('[test] ── NOTES WORK CATEGORY PASSED ──')
  }, 900000)  // 15 min — human login window + LLM capture + full replay
})
