/**
 * Click targeting against a real page.
 *
 * Regression origin: capture run d83dad89 clicked four times at guessed
 * coordinates for the "Register Patient" button, hit nothing each time, reported
 * every step as success, and then waited for a confirmation that never arrived.
 */

import { chromium, Browser, Page } from 'playwright'
import {
  snapToInteractive,
  clickKeywords,
  extractClickableContext
} from '../../../src/agent/discovery'

const PAGE = `
  <html><body style="margin:0">
    <nav><a href="/patients.html">👥 Patients</a></nav>
    <form>
      <label for="name">Name</label><input id="name" />
      <div style="height:1400px">tall filler so the submit button sits below the fold</div>
      <button type="submit" class="btn">✓ Register Patient</button>
      <button type="button">Cancel</button>
    </form>
    <div id="plain" style="position:absolute;top:300px;left:300px;width:80px;height:20px">not clickable</div>
  </body></html>`

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
})

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(PAGE)
})

afterEach(async () => {
  await page?.close()
})

describe('clickKeywords', () => {
  it('strips the quotes the LLM puts around button labels', () => {
    // The exact description from the failed run.
    expect(clickKeywords("'Register Patient' button")).toEqual(['register', 'patient'])
  })

  it('drops filler words', () => {
    expect(clickKeywords('the Save link')).toEqual(['save'])
  })
})

describe('snapToInteractive', () => {
  it('finds a quoted submit button that is below the fold', async () => {
    // Coordinates near the bottom of the viewport, matching nothing — exactly
    // what the LLM guessed in the failed run.
    const result = await snapToInteractive(page, 640, 650, "'Register Patient' button")

    expect(result.missed).toBeFalsy()
    expect(result.snapped).toBe(true)

    // The coordinates must land on the real button.
    const tag = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y)
        return el?.closest('button')?.textContent?.trim() ?? null
      },
      { x: result.x, y: result.y }
    )
    expect(tag).toBe('✓ Register Patient')
  })

  it('leaves coordinates alone when they already hit a control', async () => {
    const link = await page.locator('nav a').boundingBox()
    const cx = link!.x + link!.width / 2
    const cy = link!.y + link!.height / 2
    const result = await snapToInteractive(page, cx, cy, 'Patients tab')
    expect(result.snapped).toBe(false)
    expect(result.missed).toBeFalsy()
  })

  it('rejects coordinates that land on an input instead of the named button', async () => {
    // The failure mode from run d83dad89: the guessed position sits over a text
    // field, so "something interactive is here" wrongly passed.
    const box = await page.locator('#name').boundingBox()
    const result = await snapToInteractive(
      page, box!.x + box!.width / 2, box!.y + box!.height / 2, "'Register Patient' button"
    )
    expect(result.snapped).toBe(true)
    const text = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim() ?? null,
      { x: result.x, y: result.y }
    )
    expect(text).toBe('✓ Register Patient')
  })

  it('still accepts a click on the field the description names', async () => {
    const box = await page.locator('#name').boundingBox()
    const result = await snapToInteractive(
      page, box!.x + box!.width / 2, box!.y + box!.height / 2, 'Name field'
    )
    expect(result.snapped).toBe(false)
  })

  it('reports a miss when the description matches nothing', async () => {
    const result = await snapToInteractive(page, 900, 500, 'Delete Account button')
    expect(result.missed).toBe(true)
  })

  it('picks the tighter label when several controls match', async () => {
    await page.setContent(`
      <button style="position:absolute;top:10px">Register Patient and add another</button>
      <button style="position:absolute;top:60px">Register Patient</button>`)
    const result = await snapToInteractive(page, 900, 600, "'Register Patient' button")
    const text = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.textContent?.trim() ?? null,
      { x: result.x, y: result.y }
    )
    expect(text).toBe('Register Patient')
  })

  it('matches an input[type=submit] by its value attribute', async () => {
    await page.setContent('<input type="submit" value="Save Record" style="position:absolute;top:40px" />')
    const result = await snapToInteractive(page, 900, 600, '"Save Record" button')
    expect(result.missed).toBeFalsy()
    const value = await page.evaluate(
      ({ x, y }) => (document.elementFromPoint(x, y) as HTMLInputElement | null)?.value ?? null,
      { x: result.x, y: result.y }
    )
    expect(value).toBe('Save Record')
  })
})

describe('extractClickableContext', () => {
  it('lists controls with real coordinates and flags the submit button', async () => {
    const context = await extractClickableContext(page)
    expect(context).toContain('CLICKABLE ELEMENTS')
    expect(context).toContain('Register Patient')
    expect(context).toMatch(/center=\(\d+,-?\d+\)/)
    expect(context).toContain('[SUBMITS THE FORM]')
  })

  it('marks below-the-fold controls off-screen rather than omitting them', async () => {
    const context = await extractClickableContext(page)
    const line = context.split('\n').find(l => l.includes('Register Patient'))
    expect(line).toContain('[OFF-SCREEN')
  })

  it('skips hidden controls', async () => {
    await page.setContent('<button style="display:none">Ghost</button><button>Real</button>')
    const context = await extractClickableContext(page)
    expect(context).not.toContain('Ghost')
    expect(context).toContain('Real')
  })

  it('returns empty string when the page has no controls', async () => {
    await page.setContent('<p>nothing here</p>')
    expect(await extractClickableContext(page)).toBe('')
  })
})
