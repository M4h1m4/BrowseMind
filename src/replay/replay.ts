import * as fs from 'fs'
import * as path from 'path'
import { chromium, Browser, Page } from 'playwright'
import { RunState, Artifact, Step, ElementStrategy } from '../types'
import { locateElement } from './elementLocator'
import { verifyCheckpoint } from './checkpointVerifier'
import { classifyAction, isAllowedDomain } from './guardrails'
import { writeRunLog } from '../agent/logger'
import { getAuthState } from '../session/authStore'
import { createRunContext, setVar, resolveTemplate } from './runContext'
import type { RunContext } from './runContext'
import { injectCursor, moveCursor, clickAnimation } from './cursorOverlay'

// ── Helper: does the step list (recursively) contain any 'output' step? ────────
function artifactHasOutputStep(steps: Step[]): boolean {
  return steps.some(
    s => s.actionType === 'output' || (s.innerSteps && artifactHasOutputStep(s.innerSteps))
  )
}

// ── Per-step execution (extracted so the loop step can call it recursively) ───
async function executeStep(
  page: Page,
  step: Step,
  artifact: Artifact,
  ctx: RunContext,
  inputs: Record<string, unknown>,
  insideLoop: boolean,
  runState: RunState,
  effectiveAllowWrites: boolean
): Promise<{ status: 'success' | 'failed'; errorDetails?: string }> {

  // ── Guardrail: action classification ───────────────────────────────────────
  const actionClass = classifyAction(step.actionType, step.description)

  if (actionClass === 'write' && !effectiveAllowWrites) {
    runState.status    = 'failed'
    runState.log.error = {
      step:     step.stepNumber,
      expected: 'read-only action (allowWrites is false)',
      observed: `write action "${step.actionType}" on "${step.description}" blocked`,
      type:     'hard_failure'
    }
    console.log(`[replay] write blocked at step ${step.stepNumber} — allowWrites is false`)
    return { status: 'failed', errorDetails: `write action "${step.actionType}" blocked` }
  }

  // ── Special guard for output steps ─────────────────────────────────────────
  if (step.actionType === 'output' && !effectiveAllowWrites) {
    return { status: 'failed', errorDetails: 'output step blocked: allowWrites is false' }
  }

  if (actionClass === 'destructive') {
    runState.status   = 'confirmation_required'
    runState.isPaused = true
    console.log(`[replay] destructive action at step ${step.stepNumber} — pausing for confirmation`)
    return { status: 'failed', errorDetails: 'destructive action requires confirmation' }
  }

  // ── Retry loop ──────────────────────────────────────────────────────────────
  let succeeded                    = false
  let lastError                    = ''
  let strategyUsed: ElementStrategy = 'primary'
  const startTime                  = new Date().toISOString()

  for (let attempt = 0; attempt <= step.maxRetries; attempt++) {
    try {
      const value = resolveTemplate(step.value ?? '', ctx, inputs, artifact.inputSchema)

      if (step.actionType === 'navigate') {
        if (value && !isAllowedDomain(value, (artifact.allowedDomains ?? [artifact.targetApp]))) {
          throw new Error(`Navigation to external domain blocked: ${value}`)
        }
        await page.goto(value ?? '', { waitUntil: 'domcontentloaded' })
        await injectCursor(page)

      } else if (step.actionType === 'wait') {
        await page.waitForTimeout(1000)

      } else if (step.actionType === 'keydown') {
        await page.keyboard.press(value ?? 'Enter')

      } else if (step.actionType === 'extract') {
        await moveCursor(page, 640, 100, '📋 Extracting: ' + (step.variableName ?? ''))
        const selector = step.cssSelector ?? ''
        const locator  = page.locator(selector).first()
        const raw      = step.attribute
          ? await locator.getAttribute(step.attribute, { timeout: 5000 })
          : await locator.textContent({ timeout: 5000 })
        const extracted = (raw ?? '').trim()
        setVar(ctx, step.variableName ?? '_extracted', extracted, insideLoop)

      } else if (step.actionType === 'loop') {
        await moveCursor(page, 640, 100, '🔁 Loop: ' + (step.loopSelector ?? ''))
        const allRows = await page.locator(step.loopSelector ?? '').all()

        // Filter out header rows (rows that contain <th> cells)
        const rows: (typeof allRows[0])[] = []
        for (const r of allRows) {
          if (await r.locator('th').count() === 0) rows.push(r)
        }
        console.log(`[replay] loop: ${rows.length} data rows (filtered from ${allRows.length} total)`)

        // Record the URL we start on so we know when we've navigated away from it
        const loopOriginUrl = page.url().split('?')[0]

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const rowText = (await row.textContent() ?? '').trim()
          ctx.vars.set('loop.index', String(i))
          ctx.vars.set('loop.text', rowText)

          for (const innerStep of (step.innerSteps ?? [])) {
            if (innerStep.actionType === 'click') {
              const currentBase = page.url().split('?')[0]
              const onOriginPage = currentBase === loopOriginUrl

              if (onOriginPage) {
                // Still on the loop page — scope the click to within the current row
                // This finds the action button (e.g. "View") without ambiguity
                const inRowSel = innerStep.cssSelector ?? 'a.btn, button.btn, a[href], button'
                const clickable = row.locator(inRowSel).last()
                const box = await clickable.boundingBox({ timeout: 3000 }).catch(() => null)
                if (!box) {
                  ctx.vars.delete('loop.index')
                  ctx.vars.delete('loop.text')
                  throw new Error(`Loop row ${i}: could not find clickable in row with "${inRowSel}"`)
                }
                const cx = box.x + box.width / 2
                const cy = box.y + box.height / 2
                await moveCursor(page, cx, cy, innerStep.description)
                await page.waitForTimeout(100)
                await clickAnimation(page, cx, cy)
                await page.mouse.click(cx, cy)
                await page.waitForTimeout(500)
                await injectCursor(page)
                console.log(`[replay] loop row ${i}: forward click "${innerStep.description}" ✓`)
              } else {
                // We've navigated off the origin page (e.g. detail page) — this is a
                // "go back" click. Use browser history so it works on any website.
                await moveCursor(page, 640, 360, innerStep.description)
                await page.waitForTimeout(100)
                await page.goBack({ waitUntil: 'domcontentloaded' }).catch(async () => {
                  // goBack not available (e.g. no history) — navigate directly back
                  await page.goto(loopOriginUrl, { waitUntil: 'domcontentloaded' })
                })
                await page.waitForTimeout(300)
                await injectCursor(page)
                console.log(`[replay] loop row ${i}: back navigation ✓`)
              }

              runState.log.steps.push({
                stepNumber:          innerStep.stepNumber,
                startTime:           new Date().toISOString(),
                endTime:             new Date().toISOString(),
                retryCount:          0,
                status:              'success',
                elementStrategyUsed: 'primary',
                sensitive:           innerStep.sensitive
              })
            } else {
              const result = await executeStep(
                page, innerStep, artifact, ctx, inputs, true, runState, effectiveAllowWrites
              )
              if (result.status === 'failed') {
                ctx.vars.delete('loop.index')
                ctx.vars.delete('loop.text')
                throw new Error(`Loop row ${i} inner step ${innerStep.stepNumber} failed: ${result.errorDetails}`)
              }
            }
          }
        }
        ctx.vars.delete('loop.index')
        ctx.vars.delete('loop.text')

      } else if (step.actionType === 'output') {
        await moveCursor(page, 640, 100, '💾 Writing output...')
        const fields = step.outputFields ?? []
        const arrays = fields.map(f => {
          const varName = f.variable.replace(/^\{\{|\}\}$/g, '')
          const val     = ctx.vars.get(varName)
          return Array.isArray(val) ? val : val !== undefined ? [val] : []
        })
        const maxLen = Math.max(1, ...arrays.map(a => a.length))
        const rows: Record<string, string>[] = []
        for (let i = 0; i < maxLen; i++) {
          const row: Record<string, string> = {}
          fields.forEach((f, fi) => {
            row[f.header] = arrays[fi][i] ?? arrays[fi][0] ?? ''
          })
          rows.push(row)
        }
        const outPath = path.resolve(process.cwd(), step.outputPath ?? 'output.json')
        await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
        if (step.outputFormat === 'csv') {
          const header = fields.map(f => f.header).join(',')
          const lines  = rows.map(r =>
            fields.map(f => `"${(r[f.header] ?? '').replace(/"/g, '""')}"`).join(',')
          )
          await fs.promises.writeFile(outPath, [header, ...lines].join('\n'), 'utf-8')
        } else {
          await fs.promises.writeFile(outPath, JSON.stringify(rows, null, 2), 'utf-8')
        }
        // Store in runState outputs — include the actual data so the UI can render it
        if (runState.log) {
          runState.log.outputs = {
            ...(runState.log.outputs ?? {}),
            outputPath: outPath,
            rowCount:   rows.length,
            extractedData: rows
          }
        }

      } else {
        const located = await locateElement(page, step.elementData)
        strategyUsed  = located.strategy

        // Move cursor to show the user where BrowseMind is acting
        await moveCursor(page, located.x, located.y, step.description)
        await page.waitForTimeout(100)
        if (step.actionType === 'click') {
          await clickAnimation(page, located.x, located.y)
        }

        if (step.actionType === 'click') {
          // locateElement has already scrolled the target into view. Prefer the
          // locator: it waits for the element to be actionable and THROWS on a
          // miss, where mouse.click() would silently click empty space and let
          // the step report success.
          if (located.locator) {
            await located.locator.click({ timeout: 5000 })
          } else {
            await assertClickable(page, located.x, located.y, step.description)
            await page.mouse.click(located.x, located.y)
          }

        } else if (step.actionType === 'input') {
          // Check if the target is a <select> — needs selectOption, not typing
          const isSelect = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y)
            if (!el) return null
            const select = el.tagName.toLowerCase() === 'select'
              ? el as HTMLSelectElement
              : el.closest('select') as HTMLSelectElement | null
            if (!select) return null
            let selector = ''
            if (select.id) selector = '#' + select.id
            else if (select.name) selector = `select[name="${select.name}"]`
            if (!selector) return null
            const options = Array.from(select.options)
              .filter(o => o.value && !o.text.trim().startsWith('—'))
              .map(o => ({ value: o.value, text: o.text.trim() }))
            return { selector, options }
          }, { x: located.x, y: located.y })

          if (isSelect) {
            // Find best matching option
            const target = (value ?? '').toLowerCase().trim()
            const match = isSelect.options.find(o => o.value.toLowerCase() === target)
              ?? isSelect.options.find(o => o.text.toLowerCase() === target)
              ?? isSelect.options.find(o => o.text.toLowerCase().includes(target) || target.includes(o.text.toLowerCase()))
            if (match) {
              await page.selectOption(isSelect.selector, match.value)
              console.log(`[replay] select "${isSelect.selector}" → "${match.value}"`)
            } else {
              console.warn(`[replay] no matching option for "${value}" in ${isSelect.selector}`)
            }
          } else {
            // Check if the target is a date/time input — set value via JS
            const specialInput = await page.evaluate(({ x, y }) => {
              const el = document.elementFromPoint(x, y)
              if (!el) return null
              const input = (el.closest('input') ?? el.querySelector('input')) as HTMLInputElement | null
              if (!input) return null
              const type = (input.type ?? '').toLowerCase()
              if (['date', 'time', 'datetime-local', 'month', 'week'].includes(type)) {
                let selector = ''
                if (input.id) selector = '#' + input.id
                else if (input.name) selector = `input[name="${input.name}"]`
                return { type, selector }
              }
              return null
            }, { x: located.x, y: located.y })

            if (specialInput && specialInput.selector) {
              await page.evaluate(({ selector, val }) => {
                const input = document.querySelector(selector) as HTMLInputElement
                if (input) {
                  input.value = val
                  input.dispatchEvent(new Event('input', { bubbles: true }))
                  input.dispatchEvent(new Event('change', { bubbles: true }))
                }
              }, { selector: specialInput.selector, val: value ?? '' })
              console.log(`[replay] set ${specialInput.type} "${specialInput.selector}" → "${value}"`)
            } else if (located.locator) {
              // fill() focuses, clears and sets the value, and throws if the
              // element is not editable — no silent no-op on an off-screen field.
              await located.locator.fill(value ?? '', { timeout: 5000 })
            } else {
              // Coordinate-only path: typing at a point that hits nothing is a
              // no-op the browser reports no error for, so check first.
              await assertClickable(page, located.x, located.y, step.description)
              await page.mouse.click(located.x, located.y)
              await page.waitForTimeout(100)
              await page.keyboard.type(value ?? '', { delay: 20 })

              // Confirm the value actually landed, rather than trusting the click.
              const written = await page.evaluate(({ x, y }) => {
                const el = document.elementFromPoint(x, y)
                const field = el?.closest('input, textarea') as HTMLInputElement | null
                return field ? field.value : null
              }, { x: located.x, y: located.y })

              if (written !== null && value && !written.includes(value)) {
                throw new Error(
                  `input into "${step.description}" did not take effect — field holds "${written}"`
                )
              }
            }
          }

        } else if (step.actionType === 'scroll') {
          await page.mouse.move(located.x, located.y)
          await page.mouse.wheel(0, 300)
        }
      }

      await page.waitForTimeout(step.waitAfter)

      // For click steps with url-contains checkpoints, wait for navigation
      if (step.actionType === 'click' && step.checkpoint.type === 'url-contains' && step.checkpoint.value) {
        const alreadyThere = page.url().includes(step.checkpoint.value)
        if (!alreadyThere) {
          await page.waitForURL(`**/*${step.checkpoint.value}*`, { timeout: 15000 }).catch(async () => {
            // Click may not have triggered navigation (e.g. search button missed).
            // If a search/submit button was the target, pressing Enter can be a reliable fallback.
            if (/search|submit|go|find/i.test(step.description)) {
              console.log(`[replay] click on "${step.description}" did not navigate — pressing Enter as fallback`)
              await page.keyboard.press('Enter')
              await page.waitForURL(`**/*${step.checkpoint.value}*`, { timeout: 15000 }).catch(() => {})
            }
          })
          await injectCursor(page)
        }
      }

      // Post-check: ensure the page hasn't redirected outside the allowed domain
      const currentUrl = page.url()
      if (!isAllowedDomain(currentUrl, (artifact.allowedDomains ?? [artifact.targetApp]))) {
        throw new Error(`Navigated outside allowed domain: ${currentUrl}`)
      }

      // Verify checkpoint — skip if it is the placeholder (value is empty)
      // Skip for loop steps: the loop body already proved success by iterating all rows.
      // Skip for input/scroll steps: these don't change the page, so checkpoints are
      // unreliable (LLM often hallucinates text like "First Name input field").
      const skipCheckpoint = !step.checkpoint.value ||
        step.actionType === 'loop' ||
        step.actionType === 'input' ||
        step.actionType === 'scroll'
      if (!skipCheckpoint) {
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
      if (attempt < step.maxRetries) {
        console.warn(
          `[replay] step ${step.stepNumber} attempt ${attempt + 1} failed — retrying: ${lastError}`
        )
        await page.waitForTimeout(500)
      }
    }
  }

  // Capture page state after mutating steps — proves the action had an effect
  let pageStateAfter: string | undefined
  if (succeeded && step.isMutating) {
    // Wait for DOM to update after the mutating action (e.g., success alert becoming visible)
    await page.waitForTimeout(1000)
    try {
      pageStateAfter = await page.evaluate(() => {
        // Grab visible text from alerts, banners, toasts, and the main content
        const selectors = [
          '[class*="alert"]', '[class*="success"]', '[class*="toast"]',
          '[class*="notification"]', '[class*="banner"]', '[role="alert"]'
        ]
        const elements = document.querySelectorAll(selectors.join(', '))
        const visible: string[] = []
        elements.forEach(el => {
          const htmlEl = el as HTMLElement
          if (htmlEl.offsetParent !== null || htmlEl.style.display !== 'none') {
            const text = htmlEl.textContent?.trim()
            if (text && text.length > 0 && text.length < 500) visible.push(text)
          }
        })
        // Also grab the page title and URL for context
        return JSON.stringify({
          url: window.location.href,
          title: document.title,
          alerts: visible
        })
      })
      console.log(`[replay] mutating step ${step.stepNumber} page state: ${pageStateAfter}`)
    } catch {
      // Non-critical — don't fail the step if state capture fails
    }
  }

  runState.log.steps.push({
    stepNumber:          step.stepNumber,
    startTime,
    endTime:             new Date().toISOString(),
    retryCount:          succeeded ? 0 : step.maxRetries,
    status:              succeeded ? 'success' : 'failed',
    elementStrategyUsed: strategyUsed,
    sensitive:           step.sensitive,
    errorDetails:        succeeded
      ? undefined
      : (step.sensitive ? '[redacted — sensitive step]' : lastError),
    pageStateAfter
  })

  if (!succeeded) {
    runState.status    = 'failed'
    runState.log.error = {
      step:     step.stepNumber,
      expected: `checkpoint: ${step.checkpoint.type} "${step.checkpoint.value}"`,
      observed: lastError,
      type:     'hard_failure'
    }
    console.error(
      `[replay] step ${step.stepNumber} failed after ${step.maxRetries} retries: ${lastError}`
    )
    return { status: 'failed', errorDetails: lastError }
  }

  console.log(`[replay] step ${step.stepNumber}: ${step.actionType} — "${step.description}" ✓`)
  return { status: 'success' }
}

// ── Main replay entry point ─────────────────────────────────────────────────────
/**
 * Refuse to click coordinates that hit nothing.
 *
 * Only reached when every locator strategy failed and we are clicking capture-time
 * coordinates. A miss here used to pass silently: `mouse.click()` reports no error,
 * so the step went green while the page never received the click.
 */
async function assertClickable(
  page: Page, x: number, y: number, description: string
): Promise<void> {
  const viewport = page.viewportSize()
  if (viewport && (x < 0 || y < 0 || x > viewport.width || y > viewport.height)) {
    throw new Error(
      `click on "${description}" targets (${Math.round(x)},${Math.round(y)}), ` +
      `outside the ${viewport.width}x${viewport.height} viewport — the click would hit nothing`
    )
  }

  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el ? el.tagName.toLowerCase() : null
  }, { x, y })

  if (!hit) {
    throw new Error(
      `click on "${description}" at (${Math.round(x)},${Math.round(y)}) landed on no element`
    )
  }
}

export async function runReplay(
  runState: RunState,
  artifact: Artifact,
  inputs: Record<string, unknown>
): Promise<void> {
  let browser: Browser | null = null

  // Auto-enable allowWrites if any step (recursively) is an output step
  const effectiveAllowWrites = artifact.allowWrites || artifactHasOutputStep(artifact.steps)

  try {
    browser = await chromium.launch({ headless: false })
    const context = await browser.newContext()
    const page    = await context.newPage()

    await page.setViewportSize({ width: 1280, height: 720 })

    // ── Inject stored auth state so the replay starts already logged in ────────
    try {
      const domain    = new URL(artifact.targetApp).hostname
      const authState = getAuthState(artifact.tenantId, domain)
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

    await page.goto(artifact.targetApp, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await injectCursor(page)

    const ctx = createRunContext()

    for (const step of artifact.steps) {
      runState.currentStep = step.stepNumber

      const result = await executeStep(
        page, step, artifact, ctx, inputs, false, runState, effectiveAllowWrites
      )

      if (result.status === 'failed') {
        // runState has already been updated inside executeStep
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

// ── Kept for reference; no longer called in the replay loop ───────────────────
function resolveValue(
  value: string | undefined,
  inputs: Record<string, unknown>
): string | undefined {
  if (!value) return value
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => String(inputs[key] ?? ''))
}
