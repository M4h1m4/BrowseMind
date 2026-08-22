/**
 * Below-the-fold targeting, against a real browser.
 *
 * Regression origin: replay run ca3de9e6 reported 17/17 steps successful while
 * writing no record at all. The submit button measured at y=1612 in a 720px
 * viewport; the "scroll into view" guard used document.elementFromPoint, which
 * returns null outside the viewport, so no scroll happened and mouse.click()
 * pressed empty space without error.
 */

import { chromium, Browser, Page } from 'playwright'
import { locateElement, scrollCoordinatesIntoView } from '../../../src/replay/elementLocator'
import { ElementData } from '../../../src/types'

const LONG_FORM = `
  <html><body style="margin:0">
    <form onsubmit="document.getElementById('done').style.display='block';return false">
      <input id="top-field" placeholder="Top Field" />
      <div style="height:1400px">filler</div>
      <input id="deep-field" placeholder="Deep Field" />
      <button type="submit">✓ Register Patient</button>
    </form>
    <div id="done" style="display:none">Registered successfully</div>
  </body></html>`

function elementData(overrides: Partial<ElementData> = {}): ElementData {
  return {
    primary:   { type: 'aria-label',   value: '' },
    secondary: { type: 'placeholder',  value: '' },
    tertiary:  { type: 'text-content', value: '' },
    fallback:  { type: 'coordinates',  value: { x: 0, y: 0 } },
    ...overrides
  }
}

let browser: Browser
let page: Page

beforeAll(async () => { browser = await chromium.launch() })
afterAll(async () => { await browser?.close() })

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(LONG_FORM)
})

afterEach(async () => { await page?.close() })

describe('locating an element below the fold', () => {
  it('returns coordinates inside the viewport, not the raw document offset', async () => {
    const raw = await page.locator('text=✓ Register Patient').boundingBox()
    expect(raw!.y).toBeGreaterThan(720)          // the failure condition

    const located = await locateElement(page, elementData({
      tertiary: { type: 'text-content', value: '✓ Register Patient' }
    }))

    expect(located.y).toBeGreaterThanOrEqual(0)
    expect(located.y).toBeLessThanOrEqual(720)   // now reachable
  })

  it('the located coordinates actually hit the button', async () => {
    const located = await locateElement(page, elementData({
      tertiary: { type: 'text-content', value: '✓ Register Patient' }
    }))

    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim() ?? null,
      { x: located.x, y: located.y }
    )
    expect(hit).toBe('✓ Register Patient')
  })

  it('clicking through the returned locator submits the form', async () => {
    const located = await locateElement(page, elementData({
      tertiary: { type: 'text-content', value: '✓ Register Patient' }
    }))

    expect(located.locator).toBeDefined()
    await located.locator!.click()

    expect(await page.locator('#done').isVisible()).toBe(true)
  })

  it('fills a field below the fold', async () => {
    const located = await locateElement(page, elementData({
      secondary: { type: 'placeholder', value: 'Deep Field' }
    }))

    await located.locator!.fill('typed into a field 1400px down')
    expect(await page.inputValue('#deep-field')).toBe('typed into a field 1400px down')
  })

  it('leaves an already-visible element where it is', async () => {
    const located = await locateElement(page, elementData({
      secondary: { type: 'placeholder', value: 'Top Field' }
    }))
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect(located.strategy).toBe('secondary')
  })
})

describe('capture-time coordinates that no longer point on screen', () => {
  /** Where the button sits in the document, which is what capture would record. */
  async function buttonDocumentY(): Promise<{ x: number; y: number }> {
    return page.evaluate(() => {
      const rect = document.querySelector('button')!.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + window.scrollY + rect.height / 2 }
    })
  }

  it('scrolls the page so a stale coordinate becomes clickable', async () => {
    // Capture records a coordinate against whatever scroll position it was in;
    // on a fresh load that number can point far below the fold.
    const { x, y } = await buttonDocumentY()
    expect(y).toBeGreaterThan(720)

    const result = await scrollCoordinatesIntoView(page, x, y)

    expect(result.scrolled).toBe(true)
    expect(result.y).toBeLessThanOrEqual(720)

    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim() ?? null,
      { x: result.x, y: result.y }
    )
    expect(hit).toBe('✓ Register Patient')
  })

  it('falls back to raw coordinates and scrolls them into reach', async () => {
    const { x, y } = await buttonDocumentY()
    const located = await locateElement(page, elementData({
      fallback: { type: 'coordinates', value: { x, y } }
    }))
    expect(located.strategy).toBe('fallback')
    expect(located.y).toBeLessThanOrEqual(720)
  })

  it('reports the coordinate unchanged when the page cannot scroll that far', async () => {
    // Beyond the end of the document: honest failure beats a bogus coordinate,
    // and assertClickable turns it into a real error instead of a silent miss.
    const result = await scrollCoordinatesIntoView(page, 326, 99999)
    expect(result.y).toBeGreaterThan(720)
  })
})
