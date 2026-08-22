import * as fs from 'fs'
import * as path from 'path'
import { chromium, Browser, Page } from 'playwright'
import OpenAI from 'openai'
import { RunState, LLMAction, Checkpoint, ElementData } from '../types'
import { callLLM } from './llm'
import { executeAction } from './actions'
import { extractElementData } from './extractor'
import { ArtifactBuilder } from './builder'
import { saveArtifact } from '../artifact/repository'
import { writeRunLog } from './logger'
import { waitForResume } from '../session/resumeSignal'
import { captureAndStoreAuthState } from '../session/loginHandler'
import { injectCursor, moveCursor, clickAnimation } from '../replay/cursorOverlay'
import { extractFirstSampleGoal } from './sampleParser'

// Read at call time so tests can override via process.env
function getMaxSteps(): number { return parseInt(process.env.MAX_STEPS_CAPTURE ?? '40') }

const CTX_WINDOW = 10
const LLM_INTER_STEP_DELAY = parseInt(process.env.LLM_STEP_DELAY_MS ?? '8000', 10)
const SCREENSHOT_QUALITY   = parseInt(process.env.SCREENSHOT_QUALITY ?? '70', 10)

// ── Coordinate validation helpers ────────────────────────────────────────────

/** Check if an element at (x, y) is interactive (clickable / input) */
async function isInteractiveAt(page: Page, x: number, y: number): Promise<boolean> {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return false
    const tag = el.tagName.toLowerCase()
    if (['a', 'button', 'input', 'select', 'textarea', 'option', 'label'].includes(tag)) return true
    const role = el.getAttribute('role') ?? ''
    if (['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch'].includes(role)) return true
    const style = getComputedStyle(el)
    if (style.cursor === 'pointer') return true
    // Walk up to check if a parent is clickable (e.g. <a><span>text</span></a>)
    let parent = el.parentElement
    for (let i = 0; i < 3 && parent; i++) {
      const pt = parent.tagName.toLowerCase()
      if (['a', 'button', 'label'].includes(pt)) return true
      if ((parent.getAttribute('role') ?? '') === 'button') return true
      parent = parent.parentElement
    }
    return false
  }, { x, y })
}

/**
 * Split a click target description into match keywords.
 *
 * Punctuation must go: the LLM quotes button labels ("'Register Patient' button"),
 * and a stray apostrophe in a keyword makes every substring test fail.
 */
export function clickKeywords(description: string): string[] {
  const FILLER = ['button', 'link', 'tab', 'field', 'the', 'a', 'an', 'icon', 'on', 'to', 'click']
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !FILLER.includes(w))
}

/**
 * Find the form field that best matches a natural-language description.
 *
 * ONE implementation, deliberately. This heuristic previously existed as two
 * separate copies — the coordinate-correction path and the fill-verification
 * path — and fixing one left the other choosing "Emergency Contact Phone" →
 * #phone, which then overwrote the real phone number during a re-fill.
 *
 * Scoring: how much of the description a field accounts for dominates. Matching
 * every keyword of "emergency contact phone" must beat matching just "phone",
 * so coverage is worth 10 apiece and the id/label signals are tie-breakers only.
 */
export interface FieldMatch {
  id:       string
  value:    string
  isSelect: boolean
  x:        number
  y:        number
  score:    number
}

export async function findFieldByDescription(
  page: Page, keywords: string[], scrollIntoView = false
): Promise<FieldMatch | null> {
  if (keywords.length === 0) return null

  return page.evaluate(({ keywords, scrollIntoView }) => {
    const fields = Array.from(document.querySelectorAll('input, select, textarea'))
    let bestEl: Element | null = null
    let bestScore = 0

    for (const field of fields) {
      const el = field as HTMLInputElement
      if (el.type === 'hidden') continue

      const id          = (el.id ?? '').toLowerCase()
      const name        = (el.name ?? '').toLowerCase()
      const placeholder = (el.placeholder ?? '').toLowerCase()

      let labelText = ''
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`)
        if (label) labelText = (label.textContent ?? '').toLowerCase().trim()
      }
      if (!labelText) {
        const parent = field.closest('.form-group, .field, .input-group, .form-field')
        if (parent) {
          const label = parent.querySelector('label')
          if (label) labelText = (label.textContent ?? '').toLowerCase().trim()
        }
      }

      const searchable = labelText + ' ' + placeholder + ' ' + name + ' ' + id
      const hits = keywords.filter((kw: string) => searchable.includes(kw)).length

      let score = hits * 10
      if (keywords.some((kw: string) => id === kw || name === kw)) score += 3
      if (keywords.some((kw: string) => labelText.startsWith(kw))) score += 2
      // Prefer the tighter label when coverage ties.
      score -= Math.min(searchable.trim().length / 100, 1)

      const minHits = Math.max(1, Math.ceil(keywords.length / 2))
      if (hits >= minHits && score > bestScore) {
        bestScore = score
        bestEl = field
      }
    }

    if (!bestEl) return null

    if (scrollIntoView) {
      // Synchronous: a smooth scroll would still be moving when we measure,
      // which is how a step once recorded y = -329.
      (bestEl as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' })
    }

    const el   = bestEl as HTMLInputElement
    const tag  = bestEl.tagName.toLowerCase()
    const rect = bestEl.getBoundingClientRect()

    return {
      id:       el.id || el.name || '',
      value:    tag === 'select'
        ? ((bestEl as HTMLSelectElement).selectedOptions[0]?.text ?? '')
        : (el.value ?? ''),
      isSelect: tag === 'select',
      x:        rect.x + rect.width / 2,
      y:        rect.y + rect.height / 2,
      score:    bestScore
    }
  }, { keywords, scrollIntoView })
}

/**
 * Does the element at (x, y) plausibly match the click description?
 *
 * Returns true when there is nothing to compare against (no description, or an
 * unlabelled control such as an icon button) — the check only rejects a clear
 * mismatch, so it never blocks a legitimate click it cannot reason about.
 */
async function matchesDescription(
  page: Page, x: number, y: number, description: string
): Promise<boolean> {
  const keywords = clickKeywords(description)
  if (keywords.length === 0) return true

  return page.evaluate(({ x, y, keywords }) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return false

    const control = el.closest('button, a, [role="button"], input, select, textarea, label') ?? el
    const tag = control.tagName.toLowerCase()

    // A click that lands in a data-entry field is a mismatch unless the
    // description actually names that field.
    const text = [
      control.textContent ?? '',
      (control as HTMLInputElement).value ?? '',
      control.getAttribute('aria-label') ?? '',
      control.getAttribute('title') ?? '',
      control.getAttribute('placeholder') ?? '',
      control.id ?? ''
    ].join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')

    const hit = keywords.some((kw: string) => text.includes(kw))
    if (hit) return true

    // Unlabelled control (icon button, image link): nothing to contradict.
    const hasLabel = text.trim().length > 0
    if (!hasLabel && !['input', 'select', 'textarea'].includes(tag)) return true

    return false
  }, { x, y, keywords })
}

/**
 * Snap coordinates to the nearest interactive element if the LLM's coordinates
 * don't land on one. Searches a small radius around the original point, then the
 * whole document by description.
 *
 * `missed` means nothing matched anywhere — the caller must not pretend the click
 * landed, or the LLM will wait for a result that can never arrive.
 */
export async function snapToInteractive(
  page: Page, x: number, y: number, description: string
): Promise<{ x: number; y: number; snapped: boolean; missed?: boolean }> {
  // "Something interactive is here" is not enough. On a long form the coordinates
  // routinely land on a text input while the description asks for the submit
  // button — clicking the input does nothing, and the run stalls waiting for a
  // result. Accept the coordinates only when the element also matches the
  // description, the same way input steps are verified against their label.
  if (await isInteractiveAt(page, x, y)) {
    if (await matchesDescription(page, x, y, description)) return { x, y, snapped: false }
    console.log(`[discovery] click coords (${x},${y}) hit an interactive element that does not match "${description}" — searching`)
  }

  // Try to find the element by its description text on the page first
  if (description) {
    try {
      const byText = page.locator(`text="${description}"`).first()
      const box = await byText.boundingBox({ timeout: 2000 })
      if (box) {
        const cx = box.x + box.width / 2
        const cy = box.y + box.height / 2
        if (await isInteractiveAt(page, cx, cy)) {
          console.log(`[discovery] snapped coords (${x},${y}) → (${cx},${cy}) via text match "${description}"`)
          return { x: cx, y: cy, snapped: true }
        }
      }
    } catch { /* text not found — continue with radius search */ }
  }

  // Search in expanding radius around original point
  const offsets = [
    [0, -10], [0, 10], [-10, 0], [10, 0],           // 10px
    [0, -20], [0, 20], [-20, 0], [20, 0],           // 20px
    [-15, -15], [15, -15], [-15, 15], [15, 15],      // diagonals
    [0, -30], [0, 30], [-30, 0], [30, 0],           // 30px
  ]

  for (const [dx, dy] of offsets) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx > 1280 || ny > 720) continue
    if (await isInteractiveAt(page, nx, ny)) {
      // Get the element's center for precise clicking
      const center = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      }, { x: nx, y: ny })
      if (center) {
        // A nearby element still has to be the one that was asked for, otherwise
        // the search just re-picks the wrong neighbour it started from.
        if (!(await matchesDescription(page, center.x, center.y, description))) continue
        console.log(`[discovery] snapped coords (${x},${y}) → (${center.x},${center.y}) via radius search`)
        return { x: center.x, y: center.y, snapped: true }
      }
    }
  }

  // Last resort: search the whole document for a control matching the description.
  // Note this searches BELOW the fold too — the submit button of a long form is
  // routinely off-screen when the LLM guesses at its position.
  if (description) {
    const keywords = clickKeywords(description)
    if (keywords.length > 0) {
      try {
        const targetId = await page.evaluate((kws) => {
          const candidates = Array.from(document.querySelectorAll(
            'button, a, [role="button"], input[type="submit"], input[type="button"]'
          ))

          let bestEl: Element | null = null
          let bestScore = 0

          for (const el of candidates) {
            const rect = (el as HTMLElement).getBoundingClientRect()
            if (rect.width === 0 || rect.height === 0) continue   // hidden

            // input[type=submit] carries its label in `value`, not textContent.
            const text = [
              el.textContent ?? '',
              (el as HTMLInputElement).value ?? '',
              el.getAttribute('aria-label') ?? '',
              el.getAttribute('title') ?? ''
            ].join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')

            const hits = kws.filter((kw: string) => text.includes(kw)).length
            if (hits === 0) continue
            // Prefer a control matching more of the description; break ties on
            // the tightest label, so "Register Patient" beats "Register Patient
            // and add another".
            const score = hits * 100 - text.trim().length
            if (hits >= Math.ceil(kws.length / 2) && (bestEl === null || score > bestScore)) {
              bestScore = score
              bestEl = el
            }
          }

          if (!bestEl) return null
          // Tag it so we can re-measure after scrolling without re-running the match.
          const marker = '__bm_click_target__'
          bestEl.setAttribute('data-bm-snap', marker)
          ;(bestEl as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' })
          return marker
        }, keywords)

        if (targetId) {
          // Wait for the smooth scroll to settle, then read the final position.
          await page.waitForTimeout(500)
          const updated = await page.evaluate(() => {
            const el = document.querySelector('[data-bm-snap]')
            if (!el) return null
            const rect = el.getBoundingClientRect()
            el.removeAttribute('data-bm-snap')
            if (rect.width === 0 || rect.height === 0) return null
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
          })
          if (updated) {
            console.log(`[discovery] snapped coords (${x},${y}) → (${updated.x},${updated.y}) via keyword search "${description}"`)
            return { x: updated.x, y: updated.y, snapped: true }
          }
        }
      } catch { /* search failed — fall through */ }
    }
  }

  console.warn(`[discovery] no interactive element near (${x},${y}) — using original coords`)
  return { x, y, snapped: false, missed: true }
}

/**
 * For input actions: verify the LLM's coordinates land on the correct form field
 * by matching the target description against the label/placeholder of the field.
 * If mismatched, find the correct field by label text.
 *
 * This prevents the LLM from typing data into the wrong field (e.g. typing DOB
 * into the First Name field because the coordinates were off).
 */
export async function snapToFormField(
  page: Page, x: number, y: number, description: string
): Promise<{ x: number; y: number; corrected: boolean }> {
  if (!description) return { x, y, corrected: false }

  // Extract keywords from description (e.g. "Date of Birth input box" → ["date", "birth"])
  const keywords = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['input', 'box', 'field', 'the', 'for', 'and', 'text', 'enter', 'type', 'into', 'fill'].includes(w))

  if (keywords.length === 0) return { x, y, corrected: false }

  // Check what field the current coordinates actually point to
  const fieldCheck = await page.evaluate(({ x, y, keywords }) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return { matched: false, needsCorrection: true, labelText: '', placeholder: '' }

    // The point must be ON the field. Reaching into a container for its first
    // descendant input claims a field the coordinates do not actually touch —
    // "Last Name" aimed at a form grid would resolve to #first-name, score half
    // the keywords, clear the 50% bar and skip correction entirely.
    const input = el.closest('input, select, textarea') ?? el
    const tag = input.tagName.toLowerCase()
    // Not a form field at all — page background, a heading, a wrapper div. This is
    // the case most in need of correction: typing here goes nowhere. It used to
    // report "no correction needed" and hand the coordinates straight back.
    if (!['input', 'select', 'textarea'].includes(tag)) {
      return { matched: false, needsCorrection: true, labelText: '', placeholder: '' }
    }

    // Check the label for this input
    const inputEl = input as HTMLInputElement
    const id = inputEl.id
    const placeholder = (inputEl.placeholder ?? '').toLowerCase()

    // Find associated label
    let labelText = ''
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`)
      if (label) labelText = (label.textContent ?? '').toLowerCase().trim()
    }
    // Also try parent/previous sibling label
    if (!labelText) {
      const parent = input.closest('.form-group, .field, .input-group')
      if (parent) {
        const label = parent.querySelector('label')
        if (label) labelText = (label.textContent ?? '').toLowerCase().trim()
      }
    }

    const fieldText = labelText + ' ' + placeholder
    const matchCount = keywords.filter((kw: string) => fieldText.includes(kw)).length
    const matched = matchCount >= Math.max(1, Math.ceil(keywords.length * 0.5))

    return { matched, needsCorrection: !matched, labelText, placeholder }
  }, { x, y, keywords })

  // If the current coords point to the right field, no correction needed
  if (fieldCheck.matched || !fieldCheck.needsCorrection) {
    return { x, y, corrected: false }
  }

  console.log(`[discovery] input field mismatch: "${description}" landed on label="${fieldCheck.labelText}" placeholder="${fieldCheck.placeholder}" — searching for correct field`)

  // Find the correct field by description — same matcher the fill-verification
  // step uses, so the two can never disagree about which field is meant.
  const correctField = await findFieldByDescription(page, keywords, true)

  if (correctField) {
    // The scroll above is synchronous, but give layout a beat before trusting
    // the measurement.
    await page.waitForTimeout(100)
    const freshCoords = await page.evaluate((fieldId) => {
      const el = document.getElementById(fieldId)
        ?? document.querySelector(`[name="${fieldId}"]`)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }, correctField.id)

    if (freshCoords) {
      console.log(`[discovery] input field corrected: "${description}" → field #${correctField.id} at (${freshCoords.x},${freshCoords.y}) (score: ${correctField.score.toFixed(1)})`)
      return { x: freshCoords.x, y: freshCoords.y, corrected: true }
    }
    // Fall back to the coordinates the matcher measured.
    console.log(`[discovery] input field corrected: "${description}" → field #${correctField.id} at (${correctField.x},${correctField.y})`)
    return { x: correctField.x, y: correctField.y, corrected: true }
  }

  // Also try Playwright's getByLabel as a fallback
  try {
    // Build a label search from the most meaningful keywords
    const labelSearch = keywords.slice(0, 3).join(' ')
    const byLabel = page.getByLabel(new RegExp(keywords.join('.*'), 'i')).first()
    const box = await byLabel.boundingBox({ timeout: 2000 })
    if (box) {
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      console.log(`[discovery] input field corrected via getByLabel: "${description}" → (${cx},${cy})`)
      return { x: cx, y: cy, corrected: true }
    }
  } catch { /* label not found */ }

  console.warn(`[discovery] could not find correct field for "${description}" — using original coords`)
  return { x, y, corrected: false }
}

// ── Checkpoint validation ────────────────────────────────────────────────────

/**
 * Validate a checkpoint returned by the LLM against the live page.
 * If it doesn't hold, generate a safe fallback from observable page state.
 */
async function validateCheckpoint(
  page: Page, checkpoint: Checkpoint | null
): Promise<{ checkpoint: Checkpoint | null; hallucinated: boolean }> {
  if (!checkpoint || !checkpoint.value) return { checkpoint, hallucinated: false }

  let valid = false
  try {
    switch (checkpoint.type) {
      case 'url-contains':
        valid = page.url().includes(checkpoint.value)
        break
      case 'text-present':
        valid = await page.locator(`text="${checkpoint.value}"`).first().isVisible({ timeout: 2000 }).catch(() => false)
        break
      case 'element-visible':
        valid = await page.locator(checkpoint.value).first().isVisible({ timeout: 2000 }).catch(() => false)
        break
    }
  } catch {
    valid = false
  }

  if (valid) return { checkpoint, hallucinated: false }

  // Checkpoint is hallucinated — generate from observable page state
  const currentUrl = page.url()
  // Extract a meaningful URL fragment (path without query params)
  const urlPath = new URL(currentUrl).pathname
  const fallback: Checkpoint = { type: 'url-contains', value: urlPath }
  console.warn(
    `[discovery] checkpoint hallucinated: ${checkpoint.type}="${checkpoint.value}" not found on page — ` +
    `replaced with url-contains="${urlPath}"`
  )
  return { checkpoint: fallback, hallucinated: true }
}

// ── Element data helpers ─────────────────────────────────────────────────────

function makeEmptyElementData(coords: { x: number; y: number } = { x: 0, y: 0 }): ElementData {
  return {
    primary:   { type: 'aria-label',   value: '' },
    secondary: { type: 'placeholder',  value: '' },
    tertiary:  { type: 'text-content', value: '' },
    fallback:  { type: 'coordinates' as const, value: coords }
  }
}

/**
 * Extract element data and enrich it: if primary/secondary/tertiary are all empty,
 * try to build a CSS selector from the DOM so replay has something better than
 * raw coordinates to work with.
 */
async function extractAndEnrich(
  page: Page, x: number, y: number
): Promise<ElementData> {
  try {
    const data = await extractElementData(page, x, y)
    // If we got nothing semantic, try to at least get the text of what's there
    if (!data.primary.value && !data.secondary.value && !data.tertiary.value) {
      const selector = await findSelectorAtCoords(page, x, y).catch(() => '')
      if (selector) {
        const text = await page.locator(selector).first()
          .textContent({ timeout: 2000 }).catch(() => '') ?? ''
        if (text.trim()) {
          data.tertiary.value = text.trim().slice(0, 100)
        }
      }
    }
    return data
  } catch {
    return makeEmptyElementData({ x, y })
  }
}

/**
 * Extract structured form field metadata from the current page.
 * Returns a concise description of every visible form field so the LLM
 * can reference fields by label/id instead of guessing from the screenshot.
 */
async function extractFormContext(page: Page): Promise<string> {
  const fields = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input, select, textarea')
    const result: { line: string; isFilled: boolean }[] = []

    for (const el of Array.from(inputs)) {
      const input = el as HTMLInputElement
      // Skip hidden fields
      if (input.type === 'hidden') continue
      const rect = input.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      const tag = el.tagName.toLowerCase()
      const type = input.type || tag
      const id = input.id || ''
      const name = input.name || ''
      const placeholder = input.placeholder || ''
      const currentValue = input.value || ''

      // Find label
      let labelText = ''
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`)
        if (label) labelText = (label.textContent ?? '').trim()
      }
      if (!labelText) {
        const parent = el.closest('.form-group, .field, .input-group, .form-field')
        if (parent) {
          const label = parent.querySelector('label')
          if (label) labelText = (label.textContent ?? '').trim()
        }
      }

      // For selects, list the options
      let options = ''
      if (tag === 'select') {
        const opts = Array.from((el as HTMLSelectElement).options)
          .map(o => o.text.trim())
          .filter(t => t && !t.startsWith('—'))
          .slice(0, 8)
        if (opts.length) options = ` options=[${opts.join(', ')}]`
      }

      const isOffScreen = rect.bottom < 0 || rect.top > window.innerHeight
      const cx = Math.round(rect.x + rect.width / 2)
      const cy = Math.round(rect.y + rect.height / 2)
      const filled = currentValue ? ` current="${currentValue}"` : ''
      const offScreenTag = isOffScreen ? ' [OFF-SCREEN — scroll to this field first]' : ''

      result.push({
        line: `  - id="${id}" label="${labelText}" type=${type} placeholder="${placeholder}"${options}${filled} center=(${cx},${cy})${offScreenTag}`,
        isFilled: !!currentValue
      })
    }

    return result
  })

  if (fields.length === 0) return ''

  const lines = fields.map((f: { line: string; isFilled: boolean }) => f.line)

  return `\nFORM FIELDS on this page (use these coordinates and ids for input actions):\n${lines.join('\n')}`
}

/**
 * Extract every clickable control on the page with its real DOM coordinates.
 *
 * Form fields already get this treatment (extractFormContext), which is why input
 * steps land accurately while clicks drift: for buttons the LLM was guessing pixel
 * positions off a downsampled screenshot. Giving it real coordinates reduces the
 * vision task to "which control", never "where is it".
 */
export async function extractClickableContext(page: Page): Promise<string> {
  const controls = await page.evaluate(() => {
    const els = document.querySelectorAll(
      'button, a[href], [role="button"], input[type="submit"], input[type="button"]'
    )
    const lines: string[] = []

    for (const el of Array.from(els)) {
      const rect = (el as HTMLElement).getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue        // hidden

      const label = (
        el.textContent?.trim() ||
        (el as HTMLInputElement).value ||
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        ''
      ).replace(/\s+/g, ' ').slice(0, 60)
      if (!label) continue

      const cx = Math.round(rect.x + rect.width / 2)
      const cy = Math.round(rect.y + rect.height / 2)
      const offScreen = rect.bottom < 0 || rect.top > window.innerHeight
      const isSubmit =
        (el as HTMLInputElement).type === 'submit' ||
        el.getAttribute('type') === 'submit'

      lines.push(
        `  - "${label}"${isSubmit ? ' [SUBMITS THE FORM]' : ''} center=(${cx},${cy})` +
        (offScreen ? ' [OFF-SCREEN — the system will scroll to it]' : '')
      )
      if (lines.length >= 40) break     // keep the prompt bounded on link-heavy pages
    }

    return lines
  })

  if (controls.length === 0) return ''

  return `\nCLICKABLE ELEMENTS on this page (use these coordinates for click actions — do NOT estimate them from the screenshot):\n${controls.join('\n')}`
}

/** Move both the native mouse cursor and the CSS overlay to (x, y) */
async function showCursor(page: Page, x: number, y: number, label: string): Promise<void> {
  await page.mouse.move(x, y, { steps: 8 }).catch(() => {})
  await moveCursor(page, x, y, label)
}

/**
 * Probe the DOM at pixel coordinates (x, y) and return the real CSS selector
 * of the element present there — no guessing, derived directly from the live DOM.
 *
 * Strategy: elementFromPoint gives us the topmost element at those coords.
 * - If it's a small leaf element, walk UP to a meaningful container.
 * - If it's a large container (lots of nested children/text), walk DOWN to
 *   find the most specific child whose bounding box contains the coordinates.
 */
async function findSelectorAtCoords(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return ''

    // Walk up if we landed on a bare text node wrapper with almost no content
    let target: Element = el
    while (
      target.parentElement &&
      target.children.length === 0 &&
      (target.textContent ?? '').trim().length < 3
    ) {
      target = target.parentElement
    }

    // Walk down: if the element is a broad container (>150 chars of text and has
    // children), drill into the most specific child whose bounding box covers (x,y)
    const MAX_DEPTH = 10
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const text = (target.textContent ?? '').trim()
      if (text.length <= 150 || target.children.length === 0) break

      let found = false
      for (const child of Array.from(target.children)) {
        const rect = child.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          target = child
          found = true
          break
        }
      }
      if (!found) break
    }

    function buildSelector(elem: Element): string {
      if (elem.id) return '#' + CSS.escape(elem.id)

      const tag = elem.tagName.toLowerCase()
      const parent = elem.parentElement
      if (!parent || parent === document.documentElement) return tag

      const classes = Array.from(elem.classList)
        .filter(c => c.length > 0 && !/^\d/.test(c))
      if (classes.length) {
        const sel = tag + '.' + classes.map(c => CSS.escape(c)).join('.')
        if (document.querySelectorAll(sel).length === 1) return sel
        // Qualify with parent
        const parentSel = buildSelector(parent)
        const qualified = parentSel + ' > ' + sel
        if (document.querySelectorAll(qualified).length === 1) return qualified
      }

      // nth-child fallback
      const siblings = Array.from(parent.children)
      const idx = siblings.indexOf(elem) + 1
      return buildSelector(parent) + ' > ' + tag + ':nth-child(' + idx + ')'
    }

    return buildSelector(target)
  }, { x, y })
}

/**
 * Search the DOM for a value element adjacent to a label matching the given description.
 * Common pattern: <div class="label">Active Conditions</div><div class="value">...</div>
 * Returns a CSS selector for the value element, or '' if not found.
 */
async function findSelectorByLabel(page: Page, description: string): Promise<string> {
  return page.evaluate((desc) => {
    // Normalize description into keywords (e.g. "Patient conditions" → ["patient", "conditions"])
    const keywords = desc.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
    if (keywords.length === 0) return ''

    // Score how well an element's text matches the keywords
    function matchScore(text: string): number {
      const lower = text.toLowerCase()
      return keywords.filter(kw => lower.includes(kw)).length
    }

    // Find all small text elements that look like labels (short text, < 80 chars)
    const candidates = document.querySelectorAll('label, .info-label, .label, th, dt, [class*="label"], [class*="header"], h1, h2, h3, h4, h5, h6')
    let bestLabel: Element | null = null
    let bestScore = 0

    for (const el of Array.from(candidates)) {
      const text = (el.textContent ?? '').trim()
      if (text.length > 80 || text.length < 2) continue
      const score = matchScore(text)
      if (score > bestScore) {
        bestScore = score
        bestLabel = el
      }
    }

    // Also check all elements with short text as potential labels
    if (bestScore < keywords.length) {
      const allEls = document.querySelectorAll('div, span, p, td')
      for (const el of Array.from(allEls)) {
        // Only consider leaf-ish elements with short text
        const text = (el.textContent ?? '').trim()
        const ownText = Array.from(el.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => (n.textContent ?? '').trim())
          .join(' ')
        const checkText = ownText.length > 2 ? ownText : text
        if (checkText.length > 80 || checkText.length < 2) continue
        const score = matchScore(checkText)
        if (score > bestScore) {
          bestScore = score
          bestLabel = el
        }
      }
    }

    if (!bestLabel || bestScore === 0) return ''

    // Found a label — now find the adjacent value element
    // Strategy 1: next sibling element
    const nextSib = bestLabel.nextElementSibling
    if (nextSib && (nextSib.textContent ?? '').trim().length > 0) {
      // Build a selector for this value element
      return buildSel(nextSib)
    }

    // Strategy 2: parent's next sibling (label and value in separate containers)
    const parentNext = bestLabel.parentElement?.nextElementSibling
    if (parentNext && (parentNext.textContent ?? '').trim().length > 0) {
      return buildSel(parentNext)
    }

    // Strategy 3: sibling within same parent that has a "value" class
    const parent = bestLabel.parentElement
    if (parent) {
      const valueSib = parent.querySelector('[class*="value"], [class*="data"], [class*="content"]')
      if (valueSib && valueSib !== bestLabel) {
        return buildSel(valueSib)
      }
    }

    return ''

    function buildSel(elem: Element): string {
      if (elem.id) return '#' + CSS.escape(elem.id)
      const tag = elem.tagName.toLowerCase()
      const par = elem.parentElement
      if (!par) return tag
      const classes = Array.from(elem.classList).filter(c => c.length > 0 && !/^\d/.test(c))
      if (classes.length) {
        const sel = tag + '.' + classes.map(c => CSS.escape(c)).join('.')
        if (document.querySelectorAll(sel).length === 1) return sel
        const parentSel = buildSel(par)
        const qualified = parentSel + ' > ' + sel
        if (document.querySelectorAll(qualified).length === 1) return qualified
      }
      const siblings = Array.from(par.children)
      const idx = siblings.indexOf(elem) + 1
      return buildSel(par) + ' > ' + tag + ':nth-child(' + idx + ')'
    }
  }, description)
}

/**
 * Given a broad CSS selector and keywords from the variable name/description,
 * search for a descendant element whose class name semantically matches.
 * E.g., selector "div.profile-header" + keywords ["name"] → finds child "div.profile-name".
 * Fully generic — works on any page structure with meaningful class names.
 */
async function findSemanticChild(
  page: Page,
  broadSelector: string,
  variableName: string,
  description: string
): Promise<string> {
  return page.evaluate(({ broadSel, varName, desc }) => {
    const parent = document.querySelector(broadSel)
    if (!parent) return ''

    // Extract keywords from variable name and description
    // "patientName" → ["patient", "name"], "Active conditions" → ["active", "conditions"]
    const raw = (varName + ' ' + desc).toLowerCase()
    const keywords = raw
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase → words
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)

    if (keywords.length === 0) return ''

    // Score each descendant by how many keywords appear in its class/id
    let bestEl: Element | null = null
    let bestScore = 0
    let bestTextLen = Infinity

    const descendants = parent.querySelectorAll('*')
    for (const el of Array.from(descendants)) {
      const classStr = (el.className ?? '').toString().toLowerCase()
      const idStr = (el.id ?? '').toLowerCase()
      const searchable = classStr + ' ' + idStr

      let score = 0
      for (const kw of keywords) {
        if (searchable.includes(kw)) score++
      }
      if (score === 0) continue

      const text = (el.textContent ?? '').trim()
      if (text.length === 0) continue

      // Prefer higher score, then shorter text (more specific)
      if (score > bestScore || (score === bestScore && text.length < bestTextLen)) {
        bestScore = score
        bestEl = el
        bestTextLen = text.length
      }
    }

    if (!bestEl) return ''

    // Build selector for the best match
    function buildSel(elem: Element): string {
      if (elem.id) return '#' + CSS.escape(elem.id)
      const tag = elem.tagName.toLowerCase()
      const par = elem.parentElement
      if (!par || par === document.documentElement) return tag
      const classes = Array.from(elem.classList).filter(c => c.length > 0 && !/^\d/.test(c))
      if (classes.length) {
        const sel = tag + '.' + classes.map(c => CSS.escape(c)).join('.')
        if (document.querySelectorAll(sel).length === 1) return sel
        const parentSel = buildSel(par)
        const qualified = parentSel + ' > ' + sel
        if (document.querySelectorAll(qualified).length === 1) return qualified
      }
      const siblings = Array.from(par.children)
      const idx = siblings.indexOf(elem) + 1
      return buildSel(par) + ' > ' + tag + ':nth-child(' + idx + ')'
    }

    return buildSel(bestEl)
  }, { broadSel: broadSelector, varName: variableName, desc: description })
}

/**
 * After a page change (click/navigate), take a fresh screenshot and ask the LLM
 * to locate a specific data field by name. Returns coordinates of that element on screen.
 * This is general — works on any page, any website.
 */
async function locateFieldOnPage(
  page: Page,
  client: OpenAI,
  variableName: string
): Promise<{ x: number; y: number } | null> {
  const screenshot = await page.screenshot({ type: 'jpeg', quality: SCREENSHOT_QUALITY })
  const base64 = screenshot.toString('base64')

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `This is a 1280x720 screenshot. Find the specific text value for "${variableName}" on screen — NOT the label, NOT the container, but the actual data value itself. Point at the smallest element that holds just that value. Return ONLY valid JSON with the pixel coordinates of its center: {"x": number, "y": number}. If not found, return {"x": null, "y": null}.`
          },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]
      }],
      response_format: { type: 'json_object' }
    })
    const result = JSON.parse(response.choices[0]?.message?.content ?? '{}')
    if (typeof result.x === 'number' && typeof result.y === 'number') {
      return { x: result.x, y: result.y }
    }
  } catch (e) {
    console.log(`[discovery] locateFieldOnPage failed for "${variableName}": ${e}`)
  }
  return null
}

/**
 * Verify that coordinates point to the correct element for an extract field.
 * Takes a screenshot, highlights the element at (x,y), and asks the LLM to confirm.
 * If rejected, searches the DOM for a better candidate by keyword, sends those
 * coordinates to the LLM for confirmation. Returns the verified selector or ''.
 */
async function verifyExtractCoordinates(
  page: Page,
  client: OpenAI,
  coords: { x: number; y: number },
  selector: string,
  varName: string,
  fieldDescription: string
): Promise<{ verified: boolean; selector: string; coords: { x: number; y: number } }> {

  // Step 1: Highlight the element at the given coords and ask LLM to confirm
  const elementText = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el ? (el.textContent ?? '').trim().slice(0, 150) : ''
  }, coords)

  // Draw a red highlight box around the element for the screenshot
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return
    const rect = el.getBoundingClientRect()
    const overlay = document.createElement('div')
    overlay.id = '__browsemind_verify_highlight'
    overlay.style.cssText = `position:fixed;left:${rect.left-2}px;top:${rect.top-2}px;width:${rect.width+4}px;height:${rect.height+4}px;border:3px solid red;background:rgba(255,0,0,0.1);z-index:999999;pointer-events:none;`
    document.body.appendChild(overlay)
  }, coords)

  const screenshot = await page.screenshot({ type: 'jpeg', quality: SCREENSHOT_QUALITY })
  const base64 = screenshot.toString('base64')

  // Remove highlight
  await page.evaluate(() => {
    document.getElementById('__browsemind_verify_highlight')?.remove()
  })

  try {
    const verifyResponse = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `This is a 1280x720 screenshot. I highlighted an element with a red border. I want to extract the value for "${fieldDescription}" (variable: "${varName}"). The highlighted element contains: "${elementText.slice(0, 100)}". Is the highlighted element the correct one that contains the ${varName} value? Answer ONLY with JSON: {"correct": true/false, "reason": "brief explanation"}`
          },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]
      }],
      response_format: { type: 'json_object' }
    })
    const result = JSON.parse(verifyResponse.choices[0]?.message?.content ?? '{}')

    if (result.correct) {
      console.log(`[discovery] extract "${varName}" — LLM confirmed coordinates ✓ (${result.reason})`)
      return { verified: true, selector, coords }
    }

    console.log(`[discovery] extract "${varName}" — LLM rejected coordinates ✗ (${result.reason})`)
  } catch (e) {
    console.log(`[discovery] extract "${varName}" — verification call failed: ${e}`)
  }

  // Step 2: LLM rejected — search DOM by keywords and suggest alternative
  const keywords = (varName + ' ' + fieldDescription).toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['extract', 'the', 'for', 'and'].includes(w))

  const candidateInfo = await page.evaluate((kws) => {
    // Search for elements whose text, class, or nearby label matches keywords
    const allElements = document.querySelectorAll('#main-content *, main *, .content *')
    let bestEl: Element | null = null
    let bestScore = 0

    for (const el of Array.from(allElements)) {
      // Skip containers with too many children (broad wrappers)
      if (el.children.length > 5) continue
      const text = (el.textContent ?? '').trim()
      if (text.length === 0 || text.length > 200) continue

      const classStr = (el.className ?? '').toString().toLowerCase()
      const idStr = (el.id ?? '').toLowerCase()

      // Check nearby label
      let labelText = ''
      const prevSib = el.previousElementSibling
      if (prevSib) {
        const pc = (prevSib.className ?? '').toString().toLowerCase()
        if (pc.includes('label') || prevSib.tagName === 'LABEL') {
          labelText = (prevSib.textContent ?? '').toLowerCase()
        }
      }
      const parent = el.parentElement
      if (parent) {
        const parentLabel = parent.querySelector('[class*="label"], label')
        if (parentLabel && parentLabel !== el) {
          labelText = labelText || (parentLabel.textContent ?? '').toLowerCase()
        }
      }

      const searchable = classStr + ' ' + idStr + ' ' + labelText
      let score = 0
      for (const kw of kws) {
        if (searchable.includes(kw)) score += 2
        if (labelText.includes(kw)) score += 3  // label match is strongest signal
      }
      if (score > 0 && text.length < 150) score += 1  // prefer concise elements

      if (score > bestScore) {
        bestScore = score
        bestEl = el
      }
    }

    if (!bestEl) return null
    const rect = bestEl.getBoundingClientRect()
    const candidateText = (bestEl.textContent ?? '').trim().slice(0, 150)

    // Build selector
    function buildSel(elem: Element): string {
      if (elem.id) return '#' + CSS.escape(elem.id)
      const tag = elem.tagName.toLowerCase()
      const par = elem.parentElement
      if (!par || par === document.documentElement) return tag
      const classes = Array.from(elem.classList).filter(c => c.length > 0 && !/^\d/.test(c))
      if (classes.length) {
        const sel = tag + '.' + classes.map(c => CSS.escape(c)).join('.')
        if (document.querySelectorAll(sel).length === 1) return sel
        const parentSel = buildSel(par)
        return parentSel + ' > ' + sel
      }
      const siblings = Array.from(par.children)
      const idx = siblings.indexOf(elem) + 1
      return buildSel(par) + ' > ' + tag + ':nth-child(' + idx + ')'
    }

    return {
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
      selector: buildSel(bestEl),
      text: candidateText
    }
  }, keywords)

  if (!candidateInfo) {
    console.log(`[discovery] extract "${varName}" — no keyword-based candidate found`)
    return { verified: false, selector: '', coords }
  }

  console.log(`[discovery] extract "${varName}" — keyword search found candidate: "${candidateInfo.selector}" text="${candidateInfo.text.slice(0, 60)}"`)

  // Step 3: Highlight the candidate and ask LLM to cross-verify
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return
    const rect = el.getBoundingClientRect()
    const overlay = document.createElement('div')
    overlay.id = '__browsemind_verify_highlight'
    overlay.style.cssText = `position:fixed;left:${rect.left-2}px;top:${rect.top-2}px;width:${rect.width+4}px;height:${rect.height+4}px;border:3px solid green;background:rgba(0,255,0,0.1);z-index:999999;pointer-events:none;`
    document.body.appendChild(overlay)
  }, candidateInfo)

  const screenshot2 = await page.screenshot({ type: 'jpeg', quality: SCREENSHOT_QUALITY })
  const base642 = screenshot2.toString('base64')

  await page.evaluate(() => {
    document.getElementById('__browsemind_verify_highlight')?.remove()
  })

  try {
    const confirmResponse = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `This is a 1280x720 screenshot. I highlighted an element with a green border. I want to extract "${fieldDescription}" (variable: "${varName}"). The highlighted element contains: "${candidateInfo.text.slice(0, 100)}". Is this the correct element for ${varName}? Answer ONLY with JSON: {"correct": true/false, "reason": "brief explanation"}`
          },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base642}` } }
        ]
      }],
      response_format: { type: 'json_object' }
    })
    const result2 = JSON.parse(confirmResponse.choices[0]?.message?.content ?? '{}')

    if (result2.correct) {
      console.log(`[discovery] extract "${varName}" — LLM confirmed alternative ✓ (${result2.reason})`)
      return {
        verified: true,
        selector: candidateInfo.selector,
        coords: { x: candidateInfo.x, y: candidateInfo.y }
      }
    }
    console.log(`[discovery] extract "${varName}" — LLM also rejected alternative ✗ (${result2.reason})`)
  } catch (e) {
    console.log(`[discovery] extract "${varName}" — alternative verification failed: ${e}`)
  }

  return { verified: false, selector: '', coords }
}

/**
 * During CAPTURE: run inner steps on the FIRST row only to validate the pattern.
 * After every click/navigate, takes a fresh screenshot and uses LLM vision +
 * DOM probing to find the real CSS selector of each extract target on the new page.
 * This is fully general — works on any website.
 * REPLAY iterates all rows.
 */
async function executeLoopCapture(
  page: Page,
  loopAction: LLMAction,
  targetApp: string,
  client: OpenAI
): Promise<void> {
  const selector = loopAction.loopSelector ?? ''
  if (!selector) return

  const allRows = await page.locator(selector).all()
  if (allRows.length === 0) return

  // Filter out header rows (rows that contain <th> elements)
  const dataRows: typeof allRows = []
  for (const r of allRows) {
    const hasHeader = await r.locator('th').count() > 0
    if (!hasHeader) dataRows.push(r)
  }
  if (dataRows.length === 0) {
    // Fallback: if selector only grabs headers, try tbody > tr
    const tbodySelector = selector.replace(/\s+tr$/, ' tbody tr').replace(/^(#[\w-]+)\s+tr$/, '$1 tbody tr')
    console.log(`[discovery] all rows were headers — retrying with: ${tbodySelector}`)
    loopAction.loopSelector = tbodySelector
    const tbodyRows = await page.locator(tbodySelector).all()
    if (tbodyRows.length === 0) return
    tbodyRows.forEach(r => dataRows.push(r))
  }

  const row   = dataRows[0]
  const total = dataRows.length
  const prefix = `[Preview 1/${total}] `

  console.log(`[discovery] loop preview: running inner steps on row 1 of ${total} (replay will handle all)`)

  for (const inner of (loopAction.innerSteps ?? [])) {

    if (inner.isMutating) {
      console.log(`[discovery] loop: executing mutating "${inner.action}" on "${inner.targetDescription}" during capture`)
    }

    if (inner.action === 'click') {
      // Click the matching element inside this specific row
      const inRowClickable = inner.cssSelector
        ? row.locator(inner.cssSelector).first()
        : row.locator('a.btn, button.btn, a[href], button').last()
      const clickBox = await inRowClickable.boundingBox({ timeout: 5000 }).catch(() => null)
      if (!clickBox) {
        console.log(`[discovery] loop capture: could not find clickable in row — skipping inner click step`)
        continue
      }
      const cx = clickBox.x + clickBox.width / 2
      const cy = clickBox.y + clickBox.height / 2

      await showCursor(page, cx, cy, prefix + inner.targetDescription)
      await page.waitForTimeout(450)
      await clickAnimation(page, cx, cy)
      await page.waitForTimeout(150)
      const urlBefore = page.url()
      await page.mouse.click(cx, cy)
      await page.waitForTimeout(2000)  // wait for JS-rendered pages to populate
      await injectCursor(page)
      const urlAfter = page.url()
      if (urlAfter === urlBefore) {
        console.log(`[discovery] loop capture: View click did not navigate (still on ${urlBefore}) — extract selectors will be resolved on this page`)
      } else {
        console.log(`[discovery] loop capture: navigated ${urlBefore} → ${urlAfter}`)
      }

      // ── After the click the page may have changed. For every extract step that
      //    follows this click, use the fresh page to find the real CSS selector. ──
      //
      // Resolution order (most semantic → most visual):
      //   1. Label-based search   — finds "Active Conditions" label → adjacent value
      //   2. LLM vision + coords  — visual locate → DOM probe at coordinates
      //   3. Semantic class match  — broad selector + keywords → child with matching class
      //   Precision check (≤200 chars) applied after each step.

      const upcomingExtracts = (loopAction.innerSteps ?? []).filter(s => s.action === 'extract')
      const usedSelectors = new Set<string>()   // track selectors already claimed by prior extracts
      for (const extractStep of upcomingExtracts) {
        const fieldDescription = extractStep.targetDescription || extractStep.variableName || ''
        const varName = extractStep.variableName || ''
        const MAX_TEXT_LEN = 200

        // Helper: check if a selector exists AND is precise (not too much text)
        async function isSelectorPrecise(sel: string | undefined): Promise<boolean> {
          if (!sel) return false
          const count = await page.locator(sel).count().catch(() => 0)
          if (count === 0) return false
          const text = await page.locator(sel).first().textContent({ timeout: 3000 }).catch(() => null)
          if (text === null) return false
          return text.trim().length <= MAX_TEXT_LEN
        }

        // Quick check: does the LLM's original selector already work and is precise?
        // BUT reject if this same selector was already used by a prior extract (would produce duplicate data)
        if (extractStep.cssSelector && !usedSelectors.has(extractStep.cssSelector) && await isSelectorPrecise(extractStep.cssSelector)) {
          console.log(`[discovery] extract "${varName}" selector "${extractStep.cssSelector}" verified ✓ (precise)`)
          usedSelectors.add(extractStep.cssSelector)
          continue
        }
        if (extractStep.cssSelector && usedSelectors.has(extractStep.cssSelector)) {
          console.log(`[discovery] extract "${varName}" — selector "${extractStep.cssSelector}" already used by prior extract, re-resolving`)
        }

        await showCursor(page, 640, 60, prefix + `🔍 Refining selector for "${varName}"…`)
        const origSelector = extractStep.cssSelector

        // ── Step 1: Label-based search (semantic, most reliable) ────────────
        const labelSelector = await findSelectorByLabel(page, fieldDescription).catch(() => '')
        if (labelSelector && !usedSelectors.has(labelSelector) && await isSelectorPrecise(labelSelector)) {
          extractStep.cssSelector = labelSelector
          usedSelectors.add(labelSelector)
          console.log(`[discovery] extract "${varName}" — label-based: ${labelSelector} ✓`)
          continue
        }
        if (labelSelector) {
          console.log(`[discovery] extract "${varName}" — label-based "${labelSelector}" ${usedSelectors.has(labelSelector) ? 'already used' : 'not precise'}`)
        }

        // ── Step 2: Page-wide semantic search (class/id matching) ─────────
        // Search entire main content area for elements whose class/id matches
        // the variable name keywords. E.g. "patientName" → finds ".profile-name"
        const mainContentSel = await page.locator('#main-content, main, [role="main"]').first().count().catch(() => 0) > 0
          ? '#main-content, main, [role="main"]'
          : 'body'
        const semanticPageSel = await findSemanticChild(page, mainContentSel, varName, fieldDescription).catch(() => '')
        if (semanticPageSel && !usedSelectors.has(semanticPageSel) && await isSelectorPrecise(semanticPageSel)) {
          extractStep.cssSelector = semanticPageSel
          usedSelectors.add(semanticPageSel)
          console.log(`[discovery] extract "${varName}" — page-wide semantic: ${semanticPageSel} ✓`)
          continue
        }
        if (semanticPageSel) {
          console.log(`[discovery] extract "${varName}" — page-wide semantic "${semanticPageSel}" ${usedSelectors.has(semanticPageSel) ? 'already used' : 'not precise'}`)
        }

        // ── Step 3: LLM vision + coordinate probe WITH verification ────────
        // Ask LLM for coordinates, find the element there, then send a highlighted
        // screenshot back to the LLM to confirm it's the right element.
        // If rejected, search by keywords and ask the LLM to cross-verify.
        const coords = await locateFieldOnPage(page, client, fieldDescription)
        if (coords) {
          const realSelector = await findSelectorAtCoords(page, coords.x, coords.y).catch(() => '')
          const isNavElement = realSelector && /\bnav\b|\bsidebar\b|\bheader\b|\bfooter\b/i.test(realSelector)
          const isDuplicate = realSelector && usedSelectors.has(realSelector)

          if (realSelector && !isNavElement && !isDuplicate) {
            // Verify with LLM before accepting
            const verification = await verifyExtractCoordinates(
              page, client, coords, realSelector, varName, fieldDescription
            )
            if (verification.verified) {
              extractStep.cssSelector = verification.selector
              extractStep.coordinates = verification.coords
              usedSelectors.add(verification.selector)
              await showCursor(page, verification.coords.x, verification.coords.y, prefix + `📋 ${varName} → ${verification.selector}`)
              await page.waitForTimeout(300)
              console.log(`[discovery] extract "${varName}" — coord-based verified: ${verification.selector} ✓`)
              continue
            }
            console.log(`[discovery] extract "${varName}" — coord-based "${realSelector}" failed verification`)
          } else if (isNavElement) {
            console.log(`[discovery] extract "${varName}" — coord-based "${realSelector}" rejected (nav/sidebar element)`)
          } else if (isDuplicate) {
            console.log(`[discovery] extract "${varName}" — coord-based "${realSelector}" already used by prior extract`)
          }
        } else {
          console.log(`[discovery] extract "${varName}" — could not locate visually`)
        }

        // ── Step 4: Semantic class match (refine a broad selector) ──────────
        // Use whichever broad selector we have (coord-based or original) as the parent,
        // and search for a child whose class/id matches keywords from the variable name
        const broadSel = extractStep.cssSelector || origSelector || ''
        if (broadSel) {
          const semanticSel = await findSemanticChild(page, broadSel, varName, fieldDescription).catch(() => '')
          if (semanticSel && !usedSelectors.has(semanticSel) && await isSelectorPrecise(semanticSel)) {
            extractStep.cssSelector = semanticSel
            usedSelectors.add(semanticSel)
            console.log(`[discovery] extract "${varName}" — semantic class match: ${semanticSel} ✓`)
            continue
          }
          if (semanticSel) {
            console.log(`[discovery] extract "${varName}" — semantic match "${semanticSel}" ${usedSelectors.has(semanticSel) ? 'already used' : 'not precise'}`)
          }
        }

        // ── No precise selector found — pick the best available ─────────────
        // Prefer label > coord > original, choosing whichever has shortest text and not already used
        const candidates = [labelSelector, extractStep.cssSelector, origSelector]
          .filter(Boolean)
          .filter(sel => !usedSelectors.has(sel!)) as string[]
        let bestSel = ''
        let bestLen = Infinity
        for (const sel of candidates) {
          const text = await page.locator(sel).first().textContent({ timeout: 3000 }).catch(() => '')
          const len = (text ?? '').trim().length
          if (len > 0 && len < bestLen) {
            bestLen = len
            bestSel = sel
          }
        }
        if (!bestSel) bestSel = origSelector || ''
        extractStep.cssSelector = bestSel
        usedSelectors.add(bestSel)
        console.warn(`[discovery] extract "${varName}" — no precise selector found, using narrowest: "${bestSel}" (${bestLen} chars)`)
      }

    } else if (inner.action === 'extract') {
      // Already resolved above after the click — just show the cursor
      const ex = inner.coordinates?.x ?? 640
      const ey = inner.coordinates?.y ?? 300
      await showCursor(page, ex, ey, prefix + `📋 Extract → ${inner.variableName} (${inner.cssSelector ?? '?'})`)
      await page.waitForTimeout(400)

    } else if (inner.action === 'navigate') {
      const raw = (inner.value ?? '').trim()
      const url = raw && raw.startsWith('http') ? raw : targetApp
      inner.value = url  // normalise so replay uses a valid URL
      await showCursor(page, 640, 40, prefix + `↩ Back`)
      await page.waitForTimeout(400)
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)
      await injectCursor(page)

    } else {
      if (inner.coordinates) {
        await showCursor(page, inner.coordinates.x, inner.coordinates.y, prefix + inner.targetDescription)
        await page.waitForTimeout(400)
      }
      await executeAction(page, inner)
      await page.waitForTimeout(800)
      await injectCursor(page)
    }
  }
}

export async function runDiscovery(
  runState: RunState,
  goal: string,
  targetApp: string,
  tenantId: string,
  allowedDomains: string[] = [],
  client: OpenAI = new OpenAI()
): Promise<void> {
  const builder = new ArtifactBuilder()
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({ headless: false })
    const context  = await browser.newContext()
    const page     = await context.newPage()

    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(targetApp, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await injectCursor(page)

    let updatedSummary  = ''
    const stepLog: string[] = []
    // Track which step numbers had their checkpoint hallucinated
    // (i.e., the PREVIOUS step didn't achieve what was expected)
    const hallucinatedCheckpoints = new Set<number>()
    let stepNumber = 1

    while (stepNumber <= getMaxSteps()) {
      // 1. Screenshot — JPEG keeps token cost low; image tokens scale with
      //    dimensions, not file size, so quality costs nothing extra.
      const screenshot       = await page.screenshot({ type: 'jpeg', quality: SCREENSHOT_QUALITY })
      const screenshotBase64 = screenshot.toString('base64')

      // 2. Sliding context window — last 10 step descriptions + running summary
      const windowSteps = stepLog.slice(-CTX_WINDOW)
      const isFirstStep = stepNumber === 1

      // 2b. Extract form field context from the live page (if any forms are present)
      const formContext = await extractFormContext(page).catch(() => '')
      const clickContext = await extractClickableContext(page).catch(() => '')

      // 3. LLM decision — only pass the first data sample during capture
      const captureGoal = extractFirstSampleGoal(goal)
      const action = await callLLM(
        client,
        captureGoal,
        updatedSummary,
        windowSteps,
        screenshotBase64,
        isFirstStep,
        formContext + clickContext
      )

      updatedSummary       = action.updatedSummary
      runState.currentStep = stepNumber

      // Hard guard: LLM sometimes declares goalComplete prematurely (before output step)
      // Allow goalComplete on: 'output' actions, or mutating actions (write workflows have no output step).
      if (action.goalComplete && action.action !== 'output' && !action.isMutating) {
        console.log(`[discovery] ⚠ goalComplete overridden — action="${action.action}" is not 'output' or mutating. Continuing.`)
        action.goalComplete = false
      }
      // Also guard: output without outputPath/outputFields is incomplete
      if (action.action === 'output' && (!action.outputPath || !action.outputFields?.length)) {
        console.log(`[discovery] ⚠ output action missing outputPath/outputFields — setting goalComplete=false`)
        action.goalComplete = false
      }

      // 4. Login required — pause and wait for credentials via resume endpoint
      if (action.requiresLogin) {
        runState.status   = 'login_required'
        runState.isPaused = true
        console.log(`[discovery] login required at step ${stepNumber} — please log in manually in the browser and call POST /api/v1/runs/{runId}/resume`)

        await waitForResume(runState.runId)

        runState.status   = 'running'
        runState.isPaused = false

        // Wait for post-login navigation to settle before capturing session
        await page.waitForTimeout(3000)
        await captureAndStoreAuthState(context, page, targetApp, tenantId)

        // Re-loop: take fresh screenshot and ask LLM what to do next
        continue
      }

      console.log(
        `[discovery] step ${stepNumber}: ${action.action} — "${action.targetDescription}"`
      )

      // ── 4b. Validate checkpoint from LLM against live page ─────────────
      if (action.checkpointForPreviousStep) {
        const { checkpoint: validatedCp, hallucinated } = await validateCheckpoint(
          page, action.checkpointForPreviousStep
        )
        action.checkpointForPreviousStep = validatedCp
        if (hallucinated) {
          // The previous step's checkpoint was hallucinated — mark it
          // so we can prune that step if it was a failed navigation attempt
          hallucinatedCheckpoints.add(stepNumber)
        }
      }

      // ── 4c. Validate & snap coordinates for click/input/scroll ─────────
      let clickMissed = false
      // Set when an input could not be written to the page. Such a step must not
      // reach the artifact: replaying it can only fail, and the failure surfaces
      // far from its cause.
      let inputFailed = false
      const needsCoords = ['click', 'input', 'scroll'].includes(action.action)
      if (needsCoords && action.coordinates) {
        // For input actions: verify the field matches the target description
        // (prevents typing data into the wrong form field)
        if (action.action === 'input') {
          const fieldSnap = await snapToFormField(
            page, action.coordinates.x, action.coordinates.y, action.targetDescription
          )
          action.coordinates = { x: fieldSnap.x, y: fieldSnap.y }
        } else {
          const snapped = await snapToInteractive(
            page, action.coordinates.x, action.coordinates.y, action.targetDescription
          )
          action.coordinates = { x: snapped.x, y: snapped.y }
          // Nothing clickable anywhere — remember it so step 9 can tell the LLM,
          // instead of letting it believe the click landed.
          clickMissed = snapped.missed === true && action.action === 'click'
        }
      }

      // ── 5. Extract element data BEFORE action (for click/input/scroll) ─
      //    These actions may navigate the page, so we must capture the target
      //    element's identity while it's still on screen.
      let elementData: ElementData
      if (action.action === 'loop' || action.action === 'output') {
        elementData = makeEmptyElementData()
      } else if (needsCoords && action.coordinates) {
        elementData = await extractAndEnrich(page, action.coordinates.x, action.coordinates.y)
      } else if (action.action === 'extract' && action.coordinates) {
        elementData = await extractAndEnrich(page, action.coordinates.x, action.coordinates.y)
      } else {
        elementData = makeEmptyElementData(action.coordinates ?? { x: 0, y: 0 })
      }

      // ── 5b. Validate extract selectors outside of loops ────────────────
      if (action.action === 'extract' && action.cssSelector) {
        const count = await page.locator(action.cssSelector).count().catch(() => 0)
        if (count === 0) {
          console.log(`[discovery] extract selector "${action.cssSelector}" matched 0 elements — probing DOM`)
          // Try label-based search
          const desc = action.targetDescription || action.variableName || ''
          const labelSel = await findSelectorByLabel(page, desc).catch(() => '')
          if (labelSel && await page.locator(labelSel).count().catch(() => 0) > 0) {
            console.log(`[discovery] extract selector corrected via label: "${labelSel}"`)
            action.cssSelector = labelSel
          } else if (action.coordinates) {
            // Fall back to coordinate probe
            const realSel = await findSelectorAtCoords(page, action.coordinates.x, action.coordinates.y).catch(() => '')
            if (realSel) {
              console.log(`[discovery] extract selector corrected via coords: "${realSel}"`)
              action.cssSelector = realSel
            }
          }
        } else {
          // Selector exists — but check if it's too broad (>200 chars of text)
          const text = await page.locator(action.cssSelector).first()
            .textContent({ timeout: 2000 }).catch(() => '') ?? ''
          if (text.trim().length > 200 && action.coordinates) {
            console.log(`[discovery] extract selector "${action.cssSelector}" too broad (${text.trim().length} chars) — refining`)
            const narrower = await findSelectorAtCoords(page, action.coordinates.x, action.coordinates.y).catch(() => '')
            if (narrower) {
              const narrowText = await page.locator(narrower).first()
                .textContent({ timeout: 2000 }).catch(() => '') ?? ''
              if (narrowText.trim().length < text.trim().length) {
                console.log(`[discovery] extract selector refined: "${narrower}" (${narrowText.trim().length} chars)`)
                action.cssSelector = narrower
              }
            }
          }
        }
      }

      // ── 6. Mutating actions execute during capture ────────────────────
      //    Previously skipped (dry-run), now executed so we capture accurate
      //    element data and prove the workflow works end-to-end.
      if (action.isMutating) {
        console.log(`[discovery] mutating action "${action.action}" on "${action.targetDescription}" — executing during capture`)
      }

      // ── 7. Show cursor then execute action ─────────────────────────────
      if (action.action === 'loop') {
        // Only run the loop preview ONCE
        const alreadyLooped = stepLog.some(s => s.includes('action=loop'))
        if (alreadyLooped) {
          console.log(`[discovery] loop already previewed — skipping duplicate`)
        } else {
          // ── Validate loopSelector on the live page ──────────────────────────
          // If the LLM guessed a selector that matches 0 elements, find the real one
          const guessedSel = action.loopSelector ?? ''
          const matchCount = guessedSel ? await page.locator(guessedSel).count() : 0
          if (matchCount === 0) {
            console.log(`[discovery] loopSelector "${guessedSel}" matched 0 elements — enumerating tables from DOM`)

            // Enumerate every table on the live page with its id, headers, and row count
            const tables = await page.evaluate(() => {
              return Array.from(document.querySelectorAll('table')).map(t => {
                const id       = t.id || ''
                const classes  = Array.from(t.classList).join(' ')
                const headers  = Array.from(t.querySelectorAll('thead th, thead td'))
                                   .map(th => (th.textContent ?? '').trim())
                                   .filter(Boolean)
                                   .join(', ')
                const tbodyRows = t.querySelectorAll('tbody tr').length
                const allRows   = t.querySelectorAll('tr').length
                // Build the most specific selector we can
                const sel = id ? `#${id} tbody tr`
                          : classes ? `.${classes.trim().split(/\s+/)[0]} tbody tr`
                          : ''
                return { id, classes, headers, tbodyRows, allRows, sel }
              }).filter(t => t.tbodyRows > 0 || t.allRows > 1) // skip empty / header-only tables
            })

            console.log(`[discovery] tables on page: ${JSON.stringify(tables)}`)

            // Also enumerate non-table repeating lists (ul/ol with >1 li)
            const lists = await page.evaluate(() => {
              return Array.from(document.querySelectorAll('ul, ol')).map(ul => {
                const id      = ul.id || ''
                const classes = Array.from(ul.classList).join(' ')
                const items   = ul.querySelectorAll('li').length
                const sel     = id ? `#${id} > li`
                              : classes ? `.${classes.trim().split(/\s+/)[0]} > li`
                              : ''
                return { id, classes, items, sel }
              }).filter(l => l.items > 1)
            })

            // Ask LLM to pick the right table/list given the goal and what tables exist
            if (tables.length > 0 || lists.length > 0) {
              const tableDesc = tables.map(t =>
                `table id="${t.id}" classes="${t.classes}" headers="${t.headers}" tbodyRows=${t.tbodyRows} selector="${t.sel}"`
              ).join('\n')
              const listDesc = lists.map(l =>
                `list id="${l.id}" classes="${l.classes}" items=${l.items} selector="${l.sel}"`
              ).join('\n')

              const pickResp = await client.chat.completions.create({
                model: 'gpt-4o',
                max_tokens: 80,
                messages: [{
                  role: 'user',
                  content: `Goal: "${goal}"\n\nTables on page:\n${tableDesc || '(none)'}\n\nLists on page:\n${listDesc || '(none)'}\n\nWhich selector matches the repeating rows most relevant to the goal? Return ONLY valid JSON: {"selector": "..."} — use the sel field from the best match. If none fits, return {"selector": ""}.`
                }],
                response_format: { type: 'json_object' }
              })

              const picked = JSON.parse(pickResp.choices[0]?.message?.content ?? '{}')
              const corrected: string = (picked.selector ?? '').trim()

              if (corrected && corrected !== guessedSel) {
                // Verify it actually matches rows on the live page
                const verifyCount = await page.locator(corrected).count()
                if (verifyCount > 0) {
                  console.log(`[discovery] corrected loopSelector: "${guessedSel}" → "${corrected}" (${verifyCount} rows)`)
                  action.loopSelector = corrected
                } else {
                  console.log(`[discovery] corrected selector "${corrected}" also matched 0 — leaving original`)
                }
              }
            }
          } else {
            console.log(`[discovery] loopSelector "${guessedSel}" matched ${matchCount} rows ✓`)
          }

          await showCursor(page, 640, 360, `🔁 Starting loop: ${action.loopSelector ?? action.targetDescription}`)
          await page.waitForTimeout(600)
          await executeLoopCapture(page, action, targetApp, client)
        }
      } else if (action.action === 'extract') {
        const ex = action.coordinates?.x ?? 640
        const ey = action.coordinates?.y ?? 200
        await showCursor(page, ex, ey, `📋 Extract → ${action.variableName ?? action.cssSelector}`)
        await page.waitForTimeout(600)
        await executeAction(page, action)
      } else if (action.action === 'output') {
        await showCursor(page, 640, 200, `💾 Writing ${action.outputFormat?.toUpperCase() ?? 'output'}…`)
        await page.waitForTimeout(600)
        await executeAction(page, action)
      } else if (action.action === 'navigate') {
        // Guard against relative/hash URLs the LLM sometimes emits (e.g. "#dashboard", "")
        const raw = (action.value ?? '').trim()
        const safeUrl = raw && raw.startsWith('http') ? raw : targetApp
        if (safeUrl !== raw) {
          console.log(`[discovery] navigate value "${raw}" is invalid — using targetApp instead`)
          action.value = safeUrl
        }
        await showCursor(page, 640, 40, `↩ Navigate: ${safeUrl}`)
        await page.waitForTimeout(400)
        await executeAction(page, action)
      } else if (action.coordinates) {
        await showCursor(page, action.coordinates.x, action.coordinates.y, action.targetDescription)
        await page.waitForTimeout(500)
        if (action.action === 'click') {
          await clickAnimation(page, action.coordinates.x, action.coordinates.y)
          await page.waitForTimeout(150)
        }
        await executeAction(page, action)
      } else {
        await executeAction(page, action)
      }

      // Allow any triggered navigation to settle
      await page.waitForTimeout(800)

      // ── 7a. Verify click steps: did we land on the right page? ──────────
      //    For navigation clicks (tabs, menu items), extract keywords from the
      //    target description and check if the page URL or visible headings
      //    match. If not, find and click the correct element by text.
      if (action.action === 'click' && action.coordinates && !action.isMutating) {
        const clickKeywords = action.targetDescription.toLowerCase()
          .replace(/[^a-z0-9\s]/g, '').split(/\s+/)
          .filter((w: string) => w.length > 2 && !['click', 'button', 'link', 'tab', 'the', 'for', 'and', 'new', 'add', 'icon', 'sidebar', 'left', 'menu', 'section', 'navigate', 'open'].includes(w))

        if (clickKeywords.length > 0) {
          const pageCheck = await page.evaluate((keywords) => {
            const url = window.location.href.toLowerCase()
            const title = document.title.toLowerCase()
            const h1 = document.querySelector('h1, h2, .page-title, .header-title')
            const heading = h1 ? (h1.textContent ?? '').toLowerCase().trim() : ''
            const pageText = url + ' ' + title + ' ' + heading
            const matched = keywords.some((kw: string) => pageText.includes(kw))
            return { matched, url, title, heading }
          }, clickKeywords)

          if (!pageCheck.matched) {
            console.warn(`[discovery] click verification: "${action.targetDescription}" — page doesn't match (url="${pageCheck.url}", heading="${pageCheck.heading}")`)

            // Try to find and click the correct element by text
            const MAX_CLICK_RETRIES = 3
            for (let clickRetry = 0; clickRetry < MAX_CLICK_RETRIES; clickRetry++) {
              const found = await page.evaluate((desc) => {
                // Extract the core name from the description (e.g. "Patients" from "Patients tab")
                const candidates = Array.from(document.querySelectorAll('a, button, [role="tab"], [role="menuitem"], nav a, .sidebar a, .nav-link'))
                for (const el of candidates) {
                  const text = (el.textContent ?? '').trim()
                  // Check if the element text closely matches the description
                  const descWords = desc.toLowerCase().replace(/\b(click|button|link|tab|the|on|sidebar|left|menu|section|navigate)\b/g, '').trim().split(/\s+/).filter(Boolean)
                  const elText = text.toLowerCase()
                  if (descWords.length > 0 && descWords.every((w: string) => elText.includes(w))) {
                    const rect = el.getBoundingClientRect()
                    if (rect.width > 0 && rect.height > 0) {
                      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text }
                    }
                  }
                }
                return null
              }, action.targetDescription)

              if (found) {
                console.log(`[discovery] click retry ${clickRetry + 1}: found "${found.text}" at (${found.x}, ${found.y}) — clicking`)
                await showCursor(page, found.x, found.y, action.targetDescription)
                await page.waitForTimeout(300)
                await clickAnimation(page, found.x, found.y)
                await page.mouse.click(found.x, found.y)
                await page.waitForTimeout(1000)
                await injectCursor(page)

                // Update action coordinates for accurate element data
                action.coordinates = { x: found.x, y: found.y }
                elementData = await extractAndEnrich(page, found.x, found.y)

                // Verify again
                const recheck = await page.evaluate((keywords) => {
                  const url = window.location.href.toLowerCase()
                  const title = document.title.toLowerCase()
                  const h1 = document.querySelector('h1, h2, .page-title, .header-title')
                  const heading = h1 ? (h1.textContent ?? '').toLowerCase().trim() : ''
                  return keywords.some((kw: string) => (url + ' ' + title + ' ' + heading).includes(kw))
                }, clickKeywords)

                if (recheck) {
                  console.log(`[discovery] click verified after retry: "${action.targetDescription}" ✓`)
                  break
                }
              } else {
                console.warn(`[discovery] click retry ${clickRetry + 1}: could not find element matching "${action.targetDescription}"`)
                break
              }
            }
          }
        }
      }

      // ── 7b. Verify input steps: confirm value landed in the correct field ──
      //    If verification fails, find the right field, fill it, and verify again.
      //    Retry up to 3 times. Do NOT proceed to the next step until verified.
      if (action.action === 'input' && action.coordinates && action.value) {
        const inputKeywords = action.targetDescription.toLowerCase()
          .replace(/[^a-z0-9\s]/g, '').split(/\s+/)
          .filter((w: string) => w.length > 2 && !['input', 'box', 'field', 'the', 'for', 'and', 'text', 'enter', 'type', 'into', 'fill', 'respective'].includes(w))

        // Helper: find the target field and check if it has the right value
        const findAndCheckField = async (): Promise<{
          verified: boolean; fieldId: string; actual: string;
          x?: number; y?: number; isSelect?: boolean
        }> => {
          const match = await findFieldByDescription(page, inputKeywords, true)
          if (!match) return { verified: false, fieldId: '', actual: '' }

          const expectedLower = (action.value ?? '').toLowerCase().trim()
          const actualLower   = match.value.toLowerCase().trim()
          const verified = actualLower === expectedLower ||
            (actualLower !== '' && actualLower.includes(expectedLower)) ||
            (expectedLower !== '' && expectedLower.includes(actualLower))

          return verified
            ? { verified: true, fieldId: match.id, actual: match.value }
            : {
                verified: false, fieldId: match.id, actual: match.value,
                x: match.x, y: match.y, isSelect: match.isSelect
              }
        }

        const SENSITIVE_LOG_PATTERN = /password|passwd|pwd|secret|ssn|social.?security|credit.?card|cvv|\bpin\b/i
        const isSensitiveField = SENSITIVE_LOG_PATTERN.test(action.targetDescription)
        const logValue = (val: string) => isSensitiveField ? '[redacted]' : val

        const MAX_INPUT_RETRIES = 3
        let inputVerified = false
        const ssDir = path.resolve('evidence', 'screenshots', 'capture')
        fs.mkdirSync(ssDir, { recursive: true })

        for (let inputAttempt = 0; inputAttempt < MAX_INPUT_RETRIES; inputAttempt++) {
          const check = await findAndCheckField()

          // Take screenshot after each attempt to verify visually
          const ssName = `step${stepNumber}_${action.targetDescription.replace(/[^a-zA-Z0-9]/g, '_')}_attempt${inputAttempt + 1}.png`
          await page.screenshot({ path: path.join(ssDir, ssName) }).catch(() => {})
          console.log(`[discovery] 📸 screenshot: ${ssName}`)

          if (check.verified) {
            console.log(`[discovery] ✅ input verified: "${action.targetDescription}" = "${logValue(check.actual)}" in #${check.fieldId}`)
            inputVerified = true
            break
          }

          console.warn(`[discovery] ❌ input verification FAILED (attempt ${inputAttempt + 1}/${MAX_INPUT_RETRIES}) for "${action.targetDescription}": expected "${logValue(action.value)}" but got "${logValue(check.actual)}" in #${check.fieldId}`)

          if (check.x == null || check.y == null) {
            console.error(`[discovery] ❌ cannot find target field for "${action.targetDescription}" — no matching form field on page`)
            break
          }

          // Fill the correct field
          await page.waitForTimeout(500)
          if (check.isSelect) {
            const selector = check.fieldId ? `#${check.fieldId}` : 'select'
            await page.selectOption(selector, { label: action.value }).catch(async () => {
              await page.selectOption(selector, action.value).catch(() => {})
            })
            console.log(`[discovery] input re-filled via select: "${action.targetDescription}" → #${check.fieldId}`)
          } else {
            // Check if it's a date/time input — set value via JS
            const isDateInput = await page.evaluate(({ x, y }) => {
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
            }, { x: check.x, y: check.y })

            if (isDateInput && isDateInput.selector) {
              await page.evaluate(({ selector, val }) => {
                const input = document.querySelector(selector) as HTMLInputElement
                if (input) {
                  input.value = val
                  input.dispatchEvent(new Event('input', { bubbles: true }))
                  input.dispatchEvent(new Event('change', { bubbles: true }))
                }
              }, { selector: isDateInput.selector, val: action.value })
              console.log(`[discovery] input re-filled via JS (${isDateInput.type}): "${action.targetDescription}" → #${check.fieldId}`)
            } else {
              // Click field, select all (triple-click), then type
              await page.mouse.click(check.x, check.y, { clickCount: 3 })
              await page.waitForTimeout(200)
              await page.keyboard.type(action.value, { delay: 50 })
              console.log(`[discovery] input re-filled: "${action.targetDescription}" → #${check.fieldId}`)
            }
          }
          // Update coordinates for accurate element data
          action.coordinates = { x: check.x, y: check.y }
          elementData = await extractAndEnrich(page, check.x, check.y)
          await page.waitForTimeout(500)
        }

        if (!inputVerified) {
          // One final check after all retries
          const finalCheck = await findAndCheckField()
          const finalSs = `step${stepNumber}_${action.targetDescription.replace(/[^a-zA-Z0-9]/g, '_')}_FINAL.png`
          await page.screenshot({ path: path.join(ssDir, finalSs) }).catch(() => {})
          if (finalCheck.verified) {
            console.log(`[discovery] ✅ input verified after retries: "${action.targetDescription}" = "${logValue(finalCheck.actual)}" in #${finalCheck.fieldId}`)
            inputVerified = true
          } else {
            console.error(`[discovery] ❌ FAILED to fill "${action.targetDescription}" with "${logValue(action.value)}" after ${MAX_INPUT_RETRIES} attempts — step will NOT be recorded`)
            console.log(`[discovery] 📸 failure screenshot: ${finalSs}`)
            inputFailed = true
          }
        }
      }

      // Re-inject cursor after every action — clicks can navigate just like navigate actions
      await injectCursor(page)

      // Throttle to avoid OpenAI TPM rate limits
      await page.waitForTimeout(LLM_INTER_STEP_DELAY)

      // 8. Accumulate step in artifact builder.
      //    A step that never took effect is worse than a missing one: it becomes
      //    an artifact step that cannot succeed on replay. Keep it out and let the
      //    LLM try the field again on the next turn.
      const unusableStep = inputFailed || (clickMissed && action.action === 'click')
      if (!unusableStep) {
        builder.addStep(action, elementData, stepNumber)
      } else {
        console.warn(`[discovery] step ${stepNumber} not recorded — "${action.targetDescription}" did not take effect`)
      }

      // 9. Track step description for context window
      // For loop steps, add explicit memory so LLM doesn't repeat the loop
      const logEntry = action.action === 'loop'
        ? `Step ${stepNumber}: action=loop PREVIEW COMPLETE on "${action.loopSelector}" — inner steps validated on row 1. DO NOT repeat loop. Next step: output then goalComplete.`
        : inputFailed
          ? `Step ${stepNumber}: input into "${action.targetDescription}" FAILED — the value was NOT written to the page and the field is still empty. Try this SAME field again using its coordinates from the FORM FIELDS list; do not move on to the next field.`
        : clickMissed
          ? `Step ${stepNumber}: click on "${action.targetDescription}" HIT NOTHING — coordinates (${action.coordinates?.x},${action.coordinates?.y}) matched no button or link on the page. The click did NOT happen. Do not assume it worked or wait for its result: re-read the screenshot, or scroll if the target is off-screen, and click a different position.`
          : `Step ${stepNumber}: ${action.action} on "${action.targetDescription}" — ${action.reasoning}`
      stepLog.push(logEntry)
      if (clickMissed) {
        console.warn(`[discovery] step ${stepNumber}: click on "${action.targetDescription}" hit nothing — reported back to the LLM`)
      }

      // 10. Append step to run log
      runState.log.steps.push({
        stepNumber,
        startTime:           new Date().toISOString(),
        endTime:             new Date().toISOString(),
        retryCount:          0,
        status:              (clickMissed || inputFailed) ? 'failed' : 'success',
        elementStrategyUsed: 'primary',
        sensitive:           false   // discovery steps classified sensitive at build time in builder.ts
      })

      // 11. Goal complete — but verify mutating actions actually succeeded
      if (action.goalComplete) {
        if (action.isMutating) {
          // After a mutating submit, poll for success/error signals (the submit may be async)
          const MAX_POST_SUBMIT_WAIT = 5000
          const POLL_INTERVAL = 500
          let postSubmitState = { hasValidationError: false, hasSuccess: false, visibleAlerts: [] as string[], successSelector: '' }

          for (let waited = 0; waited < MAX_POST_SUBMIT_WAIT; waited += POLL_INTERVAL) {
            await page.waitForTimeout(POLL_INTERVAL)

            postSubmitState = await page.evaluate(() => {
              const body = document.body.innerText.toLowerCase()

              // Look for visible alerts, notifications, banners
              const alertElements = document.querySelectorAll(
                '.alert, .notification, .toast, .banner, .message, [role="alert"], .error, .success, .warning'
              )
              const visibleAlerts: string[] = []
              for (const el of Array.from(alertElements)) {
                const htmlEl = el as HTMLElement
                // Element is visible if it has layout (offsetParent) AND is not display:none
                const style = window.getComputedStyle(htmlEl)
                if (style.display !== 'none' && style.visibility !== 'hidden' && htmlEl.offsetHeight > 0) {
                  const text = (htmlEl.textContent ?? '').trim()
                  if (text.length > 0 && text.length < 300) visibleAlerts.push(text)
                }
              }

              // Check for common validation error patterns
              const hasValidationError =
                body.includes('please fill') ||
                body.includes('required field') ||
                body.includes('is required') ||
                body.includes('cannot be empty') ||
                visibleAlerts.some(a => /error|invalid|required|fill|missing/i.test(a))

              // Check for success patterns
              const hasSuccess =
                visibleAlerts.some(a => /success|registered|created|saved|submitted|completed/i.test(a))

              // Remember WHERE the success signal lives, so replay can verify the
              // same thing. A selector survives changing data; the alert's text
              // does not (it names the record that was just created).
              let successSelector = ''
              for (const el of Array.from(alertElements)) {
                const htmlEl = el as HTMLElement
                const style = window.getComputedStyle(htmlEl)
                if (style.display === 'none' || style.visibility === 'hidden' || htmlEl.offsetHeight === 0) continue
                const text = (htmlEl.textContent ?? '').trim()
                if (!/success|registered|created|saved|submitted|completed/i.test(text)) continue
                if (htmlEl.id) { successSelector = '#' + htmlEl.id; break }
                const cls = Array.from(htmlEl.classList).filter(c => /alert|success|toast|notification/i.test(c))
                if (cls.length) { successSelector = '.' + cls.join('.'); break }
              }

              return { hasValidationError, hasSuccess, visibleAlerts, successSelector }
            })

            // Stop polling once we detect either success or error
            if (postSubmitState.hasSuccess || postSubmitState.hasValidationError) break
          }

          console.log(`[discovery] post-submit check: validation_error=${postSubmitState.hasValidationError}, success=${postSubmitState.hasSuccess}, alerts=[${postSubmitState.visibleAlerts.map((a: string) => `"${a.slice(0, 80)}"`).join(', ')}]`)

          if (postSubmitState.hasValidationError && !postSubmitState.hasSuccess) {
            console.warn(`[discovery] ⚠ mutating action appears to have FAILED (validation error detected) — continuing to let LLM fix it`)
            action.goalComplete = false
            stepNumber++
            continue
          }

          if (!postSubmitState.hasSuccess) {
            console.warn(`[discovery] ⚠ no success signal detected after mutating action — continuing to let LLM verify`)
            action.goalComplete = false
            stepNumber++
            continue
          }

          console.log(`[discovery] ✅ mutating action confirmed successful`)

          // Record what success looked like, so replay verifies the submit instead
          // of trusting it.
          if (postSubmitState.successSelector) {
            builder.setFinalCheckpoint({ type: 'element-visible', value: postSubmitState.successSelector })
            console.log(`[discovery] final checkpoint set — element-visible "${postSubmitState.successSelector}"`)
          } else {
            console.warn(`[discovery] ⚠ no stable selector for the success signal — final step keeps an unverifiable checkpoint`)
          }
        }

        runState.status = 'success'
        console.log(`[discovery] goal complete after ${stepNumber} steps`)
        break
      }

      stepNumber++
    }

    // Max steps exceeded
    if (stepNumber > getMaxSteps() && runState.status === 'running') {
      runState.status      = 'failed'
      runState.log.error   = {
        step:     stepNumber,
        expected: 'goal complete',
        observed: `max steps (${getMaxSteps()}) exceeded`,
        type:     'hard_failure'
      }
      console.log(`[discovery] max steps (${getMaxSteps()}) exceeded — stopping`)
    }

    // Save artifact on success
    if (runState.status === 'success') {
      // Prune redundant steps (failed navigation retries) before building artifact
      const prunedCount = builder.pruneRedundantSteps(hallucinatedCheckpoints)
      if (prunedCount > 0) {
        console.log(`[discovery] pruned ${prunedCount} redundant steps from artifact`)
      }

      const artifact        = builder.build(goal, targetApp, tenantId, allowedDomains)
      saveArtifact(artifact)
      runState.artifactId   = artifact.artifactId
      runState.log.artifactId = artifact.artifactId
      console.log(`[discovery] artifact saved — id: ${artifact.artifactId}`)
    }

  } catch (err) {
    const message        = err instanceof Error ? err.message : String(err)
    runState.status      = 'failed'
    runState.log.error   = {
      step:     runState.currentStep,
      expected: 'successful navigation',
      observed: message,
      type:     'hard_failure'
    }
    console.error(`[discovery] error at step ${runState.currentStep}: ${message}`)

  } finally {
    runState.log.completedAt = new Date().toISOString()
    runState.log.status      = runState.status
    writeRunLog(runState.log)
    await browser?.close()
  }
}
