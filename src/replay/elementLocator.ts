import { Page, Locator } from 'playwright'
import { ElementData, ElementStrategy } from '../types'

export interface LocateResult {
  strategy: ElementStrategy
  x: number
  y: number
  /**
   * True when a named strategy matched a real element. False means every
   * strategy failed and these are capture-time coordinates, which may point at
   * nothing — callers must not act on them blindly.
   */
  foundByLocator: boolean
  /**
   * Handle to the matched element. Absent only when every strategy failed and we
   * fell back to the coordinates recorded at capture time — callers should prefer
   * this over (x, y) whenever it is present, because it auto-waits and throws
   * instead of silently missing.
   */
  locator?: Locator
}

/**
 * Measure an element, scrolling it into view first.
 *
 * The scroll is the important part. `boundingBox()` reports viewport-relative
 * coordinates, so an element 1600px down an unscrolled page measures at y=1600 —
 * a position outside the 720px viewport, where `mouse.click()` hits nothing and
 * `document.elementFromPoint()` returns null. Scrolling first guarantees the
 * coordinates we hand back are actually reachable.
 */
/** Per-strategy budget. Without it a missing element costs Playwright's 30s default. */
const LOCATE_TIMEOUT = 2000

async function measure(
  locator: Locator, strategy: ElementStrategy
): Promise<LocateResult | null> {
  try {
    if (await locator.count() === 0) return null
    await locator.scrollIntoViewIfNeeded({ timeout: LOCATE_TIMEOUT })
    const box = await locator.boundingBox({ timeout: LOCATE_TIMEOUT })
    if (!box) return null
    return {
      strategy,
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      foundByLocator: true,
      locator
    }
  } catch {
    return null   // not found, detached, or not scrollable — try the next strategy
  }
}

export async function locateElement(page: Page, elementData: ElementData): Promise<LocateResult> {
  // Primary: aria-label
  if (elementData.primary.value) {
    const found = await measure(
      page.locator(`[aria-label="${elementData.primary.value}"]`).first(), 'primary'
    )
    if (found) return found
  }

  // Secondary: placeholder
  if (elementData.secondary.value) {
    const found = await measure(
      page.locator(`[placeholder="${elementData.secondary.value}"]`).first(), 'secondary'
    )
    if (found) return found
  }

  // Tertiary: text content
  if (elementData.tertiary.value) {
    const found = await measure(
      page.locator(`text=${elementData.tertiary.value}`).first(), 'tertiary'
    )
    if (found) return found
  }

  // Fallback: coordinates recorded during capture. These were measured against
  // whatever scroll position capture happened to be in, so they may point off
  // screen now — bring them into reach before handing them back.
  const { x, y } = elementData.fallback.value
  const adjusted = await scrollCoordinatesIntoView(page, x, y)
  return { strategy: 'fallback', x: adjusted.x, y: adjusted.y, foundByLocator: false }
}

/**
 * Scroll the page so a viewport coordinate becomes reachable, returning the
 * coordinate's new viewport position.
 *
 * Only used for capture-time coordinates, where there is no element to scroll to.
 */
export async function scrollCoordinatesIntoView(
  page: Page, x: number, y: number
): Promise<{ x: number; y: number; scrolled: boolean }> {
  const viewport = page.viewportSize()
  if (!viewport) return { x, y, scrolled: false }
  if (y >= 0 && y <= viewport.height) return { x, y, scrolled: false }

  // Centre the target vertically, clamped to the document.
  const delta = Math.round(y - viewport.height / 2)
  const actual = await page.evaluate((by) => {
    const before = window.scrollY
    window.scrollBy(0, by)
    return window.scrollY - before
  }, delta)

  return { x, y: y - actual, scrolled: actual !== 0 }
}
