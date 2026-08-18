import path from 'path'
import fs from 'fs'
import { chromium, Browser, Page } from 'playwright'
import { RunState, Artifact, ElementStrategy } from '../types'
import { locateElement } from './elementLocator'
import { verifyCheckpoint } from './checkpointVerifier'
import { classifyAction, isAllowedDomain } from './guardrails'
import { writeRunLog } from '../agent/logger'
import { getAuthState } from '../session/authStore'
import { waitForHandoff } from '../session/handoffSignal'

export async function runReplay(
  runState: RunState,
  artifact: Artifact,
  inputs: Record<string, unknown>
): Promise<void> {
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({ headless: false, slowMo: 800 })
    const context = await browser.newContext()
    const page    = await context.newPage()

    await page.setViewportSize({ width: 1280, height: 720 })

    // ── Inject stored auth state so the replay starts already logged in ────────
    try {
      const domain    = new URL(artifact.targetApp).hostname
      const authState = getAuthState(domain)
      if (authState) {
        await context.addCookies(authState.cookies)
        await context.addInitScript((ls: Record<string, string>) => {
          for (const [key, value] of Object.entries(ls)) {
            localStorage.setItem(key, value)
          }
        }, authState.localStorage)
        console.log(`[replay] injected auth state for ${domain}`)
      }
    } catch {
      // Malformed targetApp URL — proceed without auth injection
    }

    await page.goto(artifact.targetApp, { waitUntil: 'networkidle' })

    for (const step of artifact.steps) {
      runState.currentStep = step.stepNumber

      // ── Guardrail: action classification ─────────────────────────────────────
      const actionClass = classifyAction(step.actionType, step.description)

      if (actionClass === 'write' && !artifact.allowWrites) {
        runState.status    = 'failed'
        runState.log.error = {
          step:     step.stepNumber,
          expected: 'read-only action (allowWrites is false)',
          observed: `write action "${step.actionType}" on "${step.description}" blocked`,
          type:     'hard_failure'
        }
        console.log(`[replay] write blocked at step ${step.stepNumber} — allowWrites is false`)
        return
      }

      if (actionClass === 'destructive') {
        runState.status   = 'confirmation_required'
        runState.isPaused = true
        console.log(`[replay] destructive action at step ${step.stepNumber} — pausing for confirmation`)
        return
      }

      // ── Retry loop ────────────────────────────────────────────────────────────
      let succeeded       = false
      let lastError       = ''
      let strategyUsed: ElementStrategy = 'primary'
      const startTime     = new Date().toISOString()

      for (let attempt = 0; attempt <= step.maxRetries; attempt++) {
        try {
          const value = resolveValue(step.value, inputs)

          if (step.actionType === 'navigate') {
            // Pre-check: validate navigate target stays within the allowed domain
            if (value && !isAllowedDomain(value, artifact.targetApp)) {
              throw new Error(`Navigation to external domain blocked: ${value}`)
            }
            await page.goto(value ?? '', { waitUntil: 'domcontentloaded' })

          } else if (step.actionType === 'wait') {
            await page.waitForTimeout(1000)

          } else if (step.actionType === 'keydown') {
            await page.keyboard.press(value ?? 'Enter')

          } else {
            const located = await locateElement(page, step.elementData)
            strategyUsed  = located.strategy

            if (!located.foundByLocator) {
              throw new Error(`Could not locate element — all named strategies exhausted, coordinate fallback used`)
            }

            if (step.actionType === 'click') {
              await page.mouse.click(located.x, located.y)

            } else if (step.actionType === 'input') {
              await page.mouse.click(located.x, located.y)
              await page.waitForTimeout(200)
              await page.keyboard.type(value ?? '', { delay: 50 })

            } else if (step.actionType === 'scroll') {
              await page.mouse.move(located.x, located.y)
              await page.mouse.wheel(0, 300)
            }
          }

          await page.waitForTimeout(step.waitAfter)

          // Post-check: ensure the page hasn't redirected outside the allowed domain
          const currentUrl = page.url()
          if (!isAllowedDomain(currentUrl, artifact.targetApp)) {
            throw new Error(`Navigated outside allowed domain: ${currentUrl}`)
          }

          // Verify checkpoint — skip if it is the placeholder (value is empty)
          if (step.checkpoint.value !== '') {
            const passed = await verifyCheckpoint(page, step.checkpoint)
            if (!passed) {
              throw new Error(
                `Checkpoint failed: ${step.checkpoint.type} — "${step.checkpoint.value}"`
              )
            }
          }

          succeeded = true
          break

        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err)

          // Auto-handle recoverable conditions
          for (const rc of step.recoverableConditions) {
            if (lastError.toLowerCase().includes(rc.pattern.toLowerCase())) {
              if (rc.action === 'dismiss') {
                try { await page.keyboard.press('Escape'); await page.waitForTimeout(500) } catch { /* ignore */ }
              }
              break
            }
          }

          if (attempt < step.maxRetries) {
            console.warn(
              `[replay] step ${step.stepNumber} attempt ${attempt + 1} failed — retrying: ${lastError}`
            )
            await page.waitForTimeout(1000)
          }
        }
      }

      const endTime = new Date().toISOString()

      if (succeeded) {
        runState.log.steps.push({
          stepNumber:          step.stepNumber,
          startTime,
          endTime,
          retryCount:          0,
          status:              'success',
          elementStrategyUsed: strategyUsed,
          sensitive:           step.sensitive
        })
        console.log(`[replay] step ${step.stepNumber}: ${step.actionType} — "${step.description}" ✓`)
        continue
      }

      // ── Not succeeded — determine stuck vs hard failure ────────────────────
      const isStuck = lastError.includes('Could not locate') || lastError.includes('boundingBox')

      if (isStuck) {
        // ── Stuck: take before-screenshot, pause for human ──────────────────
        let beforeScreenshot: string | undefined
        try { beforeScreenshot = await captureScreenshot(page, runState.runId, step.stepNumber, 'before') } catch { /* ignore */ }

        runState.status   = 'stuck'
        runState.isPaused = true
        runState.interventionRequest = {
          runId:           runState.runId,
          goalDescription: artifact.goal,
          currentStep:     step.stepNumber,
          whyStuck:        lastError,
          screenshotPath:  beforeScreenshot,
          artifactId:      runState.artifactId
        }

        console.log(`[replay] stuck at step ${step.stepNumber} — waiting for human handoff`)

        let humanNotes = ''
        try {
          humanNotes = await waitForHandoff(runState.runId)
        } catch (err) {
          // Handoff cancelled — mark failed
          runState.status    = 'failed'
          runState.isPaused  = false
          runState.interventionRequest = undefined
          runState.log.error = {
            step:     step.stepNumber,
            expected: 'human handoff',
            observed: err instanceof Error ? err.message : String(err),
            type:     'hard_failure'
          }
          return
        }

        // Human finished — take after-screenshot, resume
        let afterScreenshot: string | undefined
        try { afterScreenshot = await captureScreenshot(page, runState.runId, step.stepNumber, 'after') } catch { /* ignore */ }

        runState.status   = 'running'
        runState.isPaused = false
        runState.interventionRequest = undefined

        console.log(`[replay] human handoff complete — notes: "${humanNotes}" — retrying step ${step.stepNumber}`)

        // Log the stuck step with before/after screenshots and human notes
        runState.log.steps.push({
          stepNumber:          step.stepNumber,
          startTime,
          endTime:             new Date().toISOString(),
          retryCount:          step.maxRetries,
          status:              'stuck',
          elementStrategyUsed: strategyUsed,
          sensitive:           step.sensitive,
          screenshotPath:      step.sensitive ? undefined : beforeScreenshot,
          afterScreenshotPath: step.sensitive ? undefined : afterScreenshot,
          humanNotes:          humanNotes || undefined,
          errorDetails:        step.sensitive ? '[redacted — sensitive step]' : lastError
        })

        // Retry the step once after human intervention
        let recoveredOk = false
        try {
          const value = resolveValue(step.value, inputs)
          if (step.actionType === 'navigate') {
            if (value && !isAllowedDomain(value, artifact.targetApp)) throw new Error(`Navigation to external domain blocked: ${value}`)
            await page.goto(value ?? '', { waitUntil: 'domcontentloaded' })
          } else if (step.actionType === 'wait') {
            await page.waitForTimeout(1000)
          } else if (step.actionType === 'keydown') {
            await page.keyboard.press(value ?? 'Enter')
          } else {
            const located = await locateElement(page, step.elementData)
            strategyUsed  = located.strategy
            if (!located.foundByLocator) {
              throw new Error(`Could not locate element — all named strategies exhausted, coordinate fallback used`)
            }
            if (step.actionType === 'click') {
              await page.mouse.click(located.x, located.y)
            } else if (step.actionType === 'input') {
              await page.mouse.click(located.x, located.y)
              await page.waitForTimeout(200)
              await page.keyboard.type(value ?? '', { delay: 50 })
            } else if (step.actionType === 'scroll') {
              await page.mouse.move(located.x, located.y)
              await page.mouse.wheel(0, 300)
            }
          }
          await page.waitForTimeout(step.waitAfter)
          if (step.checkpoint.value !== '') {
            const passed = await verifyCheckpoint(page, step.checkpoint)
            if (!passed) throw new Error(`Checkpoint failed after handoff: ${step.checkpoint.type} — "${step.checkpoint.value}"`)
          }
          recoveredOk = true
        } catch (retryErr) {
          runState.status    = 'failed'
          runState.log.error = {
            step:     step.stepNumber,
            expected: `checkpoint after human handoff`,
            observed: retryErr instanceof Error ? retryErr.message : String(retryErr),
            type:     'hard_failure'
          }
          console.error(`[replay] step ${step.stepNumber} still failed after human handoff`)
          return
        }

        if (!recoveredOk) return
        // Successfully recovered — continue to next step
        console.log(`[replay] step ${step.stepNumber} recovered after human handoff ✓`)
        continue

      } else {
        // ── Hard failure — not a stuck condition ──────────────────────────────
        runState.log.steps.push({
          stepNumber:          step.stepNumber,
          startTime,
          endTime,
          retryCount:          step.maxRetries,
          status:              'failed',
          elementStrategyUsed: strategyUsed,
          sensitive:           step.sensitive,
          errorDetails:        step.sensitive ? '[redacted — sensitive step]' : lastError
        })
        runState.status    = 'failed'
        runState.log.error = {
          step:     step.stepNumber,
          expected: `checkpoint: ${step.checkpoint.type} "${step.checkpoint.value}"`,
          observed: lastError,
          type:     'hard_failure'
        }
        console.error(`[replay] step ${step.stepNumber} failed after ${step.maxRetries} retries: ${lastError}`)
        return
      }
    }

    runState.status = 'success'
    console.log(`[replay] completed — ${artifact.steps.length} steps succeeded`)

  } catch (err) {
    const message      = err instanceof Error ? err.message : String(err)
    runState.status    = 'failed'
    runState.log.error = {
      step:     runState.currentStep,
      expected: 'successful replay',
      observed: message,
      type:     'hard_failure'
    }
    console.error(`[replay] error at step ${runState.currentStep}: ${message}`)

  } finally {
    runState.log.completedAt = new Date().toISOString()
    runState.log.status      = runState.status
    writeRunLog(runState.log)
    await browser?.close()
  }
}

function resolveValue(
  value: string | undefined,
  inputs: Record<string, unknown>
): string | undefined {
  if (!value) return value
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => String(inputs[key] ?? ''))
}

async function captureScreenshot(page: Page, runId: string, stepNum: number, label: string): Promise<string> {
  const dir = path.join(process.cwd(), 'evidence', 'screenshots')
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${runId}-step${stepNum}-${label}.png`
  await page.screenshot({ path: path.join(dir, filename), fullPage: false })
  return `/evidence/screenshots/${filename}`
}
