/**
 * Phase 8 E2E — Operator UI
 *
 * Verifies that the UI served at http://localhost:3000 renders correctly,
 * accepts natural language input, submits a capture run, and shows the
 * live status panel. Uses a real server + real browser (Playwright).
 *
 * Run: RUN_E2E=true npm run test:e2e -- --testPathPattern="phase8"
 */

import http from 'http'
import 'dotenv/config'
import { chromium, Browser, Page } from 'playwright'
import { setupTestDb, teardownTestDb } from '../helpers/db'

const RUN_E2E = process.env.RUN_E2E === 'true'
const itE2E   = RUN_E2E ? it : it.skip

// ── Spin up the real Express app on a random port ─────────────────────────────
let server: http.Server
let baseUrl: string
let browser: Browser
let page: Page

beforeAll(async () => {
  // Import after DB is set up so initDb runs against the test DB
  setupTestDb()
  const { app } = await import('../../src/app')

  await new Promise<void>(resolve => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address() as { port: number }
  baseUrl = `http://127.0.0.1:${addr.port}`

  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  await new Promise<void>(resolve => server.close(() => resolve()))
  teardownTestDb()
})

beforeEach(async () => {
  page = await browser.newPage()
})

afterEach(async () => {
  await page.close()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Phase 8 — Operator UI', () => {
  itE2E('serves the UI at / with all expected form elements', async () => {
    await page.goto(baseUrl, { waitUntil: 'networkidle' })

    // Header
    expect(await page.textContent('header h1')).toBe('BrowseMind')

    // Goal textarea label and placeholder present
    expect(await page.locator('label[for="nl-goal"]').textContent()).toContain('automate')
    expect(await page.locator('#nl-goal').count()).toBe(1)

    // Target app and tenant inputs
    expect(await page.locator('#target-app').count()).toBe(1)
    expect(await page.locator('#tenant-id').count()).toBe(1)

    // Start Capture button
    expect(await page.locator('#btn-capture').textContent()).toContain('Start Capture')

    // Replay Artifact button
    expect(await page.locator('#btn-replay-form').textContent()).toContain('Replay Artifact')

    // Saved Artifacts card present
    expect(await page.locator('text=Saved Artifacts').count()).toBeGreaterThan(0)
  }, 20000)

  itE2E('shows validation error when submitting empty form', async () => {
    await page.goto(baseUrl, { waitUntil: 'networkidle' })

    await page.click('#btn-capture')

    // Error banner should appear
    const errorBanner = page.locator('#error-banner')
    await errorBanner.waitFor({ state: 'visible', timeout: 3000 })
    expect(await errorBanner.textContent()).toMatch(/automate/)
  }, 20000)

  itE2E('submits a capture run and shows the live status panel', async () => {
    // Mock discovery so the run doesn't open a real browser
    jest.mock('../../src/agent/discovery', () => ({
      runDiscovery: jest.fn().mockResolvedValue(undefined)
    }))

    await page.goto(baseUrl, { waitUntil: 'networkidle' })

    await page.fill('#nl-goal',    'Navigate to the dashboard')
    await page.fill('#target-app', 'https://example.com')
    await page.fill('#tenant-id',  'e2e-tenant')

    await page.click('#btn-capture')

    // Run status card should appear
    const statusCard = page.locator('#run-status-card')
    await statusCard.waitFor({ state: 'visible', timeout: 5000 })
    expect(await statusCard.isVisible()).toBe(true)

    // Run ID label populated
    const runLabel = await page.textContent('#run-id-label')
    expect(runLabel).toMatch(/#[0-9a-f-]+/)

    // Status area shows running banner
    const statusArea = page.locator('#status-area')
    await statusArea.waitFor({ state: 'visible', timeout: 5000 })
    expect(await statusArea.textContent()).toContain('Running')
  }, 30000)

  itE2E('loads artifacts list when tenant ID is entered and refresh clicked', async () => {
    await page.goto(baseUrl, { waitUntil: 'networkidle' })

    await page.fill('#tenant-id', 'e2e-tenant')

    // Click Refresh
    await page.click('button:has-text("Refresh")')
    await page.waitForTimeout(1000)

    // Should show either artifacts or empty state (no crash)
    const listEl = page.locator('#artifact-list')
    expect(await listEl.isVisible()).toBe(true)
    const text = await listEl.textContent()
    expect(text).toBeTruthy()
  }, 20000)

  itE2E('shows replay sub-form when Replay Artifact is clicked', async () => {
    await page.goto(baseUrl, { waitUntil: 'networkidle' })

    // Form is hidden initially
    expect(await page.locator('#replay-form').isHidden()).toBe(true)

    await page.click('#btn-replay-form')

    // Form becomes visible
    expect(await page.locator('#replay-form').isVisible()).toBe(true)
    expect(await page.locator('#artifact-id-input').isVisible()).toBe(true)

    // Cancel hides it again
    await page.click('button:has-text("Cancel")')
    expect(await page.locator('#replay-form').isHidden()).toBe(true)
  }, 20000)
})
