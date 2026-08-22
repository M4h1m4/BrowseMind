/**
 * Choosing the right form field from a natural-language description.
 *
 * Regression origin: capture run be5670a2 aimed "Emergency Contact Phone" at
 * #phone, because exact-id and label-prefix bonuses outweighed keyword coverage
 * (#phone scored 6 on one keyword; #emergency-phone scored 5 on all three). The
 * step was recorded with empty locators and an off-screen coordinate, and the
 * replay built from it could never fill the field.
 */

import { chromium, Browser, Page } from 'playwright'
import { snapToFormField, findFieldByDescription } from '../../../src/agent/discovery'

const FORM = `
  <html><body style="margin:0">
    <form>
      <div class="form-group"><label for="phone">Phone Number</label>
        <input type="tel" id="phone" name="phone" placeholder="(617) 555-0000" /></div>
      <div class="form-group"><label for="emergency-name">Emergency Contact Name</label>
        <input type="text" id="emergency-name" name="emergencyName" /></div>
      <div class="form-group"><label for="emergency-phone">Emergency Contact Phone</label>
        <input type="tel" id="emergency-phone" name="emergencyPhone" placeholder="(617) 555-0001" /></div>
      <div class="form-group"><label for="email">Email Address</label>
        <input type="email" id="email" name="email" /></div>
      <div class="form-group"><label for="address">Home Address</label>
        <input type="text" id="address" name="address" /></div>
    </form>
  </body></html>`

let browser: Browser
let page: Page

beforeAll(async () => { browser = await chromium.launch() })
afterAll(async () => { await browser?.close() })

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(FORM)
})

afterEach(async () => { await page?.close() })

/** Which field id do these coordinates land on? */
async function fieldAt(x: number, y: number): Promise<string | null> {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return (el?.closest('input, select, textarea') as HTMLElement | null)?.id ?? null
  }, { x, y })
}

/** Centre of a field, i.e. coordinates the LLM might have guessed. */
async function centreOf(selector: string): Promise<{ x: number; y: number }> {
  const box = (await page.locator(selector).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

describe('snapToFormField', () => {
  it('prefers the field matching the whole description over a generic one', async () => {
    // Coordinates land on the wrong field, as they did in the failing run.
    const wrong = await centreOf('#email')
    const result = await snapToFormField(page, wrong.x, wrong.y, 'Emergency Contact Phone input field')

    expect(result.corrected).toBe(true)
    expect(await fieldAt(result.x, result.y)).toBe('emergency-phone')
  })

  it('does not confuse the plain phone field with the emergency one', async () => {
    const wrong = await centreOf('#email')
    const result = await snapToFormField(page, wrong.x, wrong.y, 'Phone Number input field')

    expect(await fieldAt(result.x, result.y)).toBe('phone')
  })

  it('distinguishes emergency contact name from emergency contact phone', async () => {
    const wrong = await centreOf('#email')
    const result = await snapToFormField(page, wrong.x, wrong.y, 'Emergency Contact Name input field')

    expect(await fieldAt(result.x, result.y)).toBe('emergency-name')
  })

  it('leaves coordinates alone when they already hit the right field', async () => {
    const right = await centreOf('#emergency-phone')
    const result = await snapToFormField(page, right.x, right.y, 'Emergency Contact Phone input field')

    expect(result.corrected).toBe(false)
    expect(result.x).toBe(right.x)
    expect(result.y).toBe(right.y)
  })

  it('corrects coordinates that land on a container rather than a field', async () => {
    // elementFromPoint over a layout wrapper used to resolve to the wrapper's
    // first descendant input, which passed the match test for the wrong field.
    await page.setContent(`
      <div class="form-grid" style="height:200px;padding:60px">
        <div class="form-group"><label for="first-name">First Name</label>
          <input id="first-name" name="firstName" /></div>
        <div class="form-group"><label for="last-name">Last Name</label>
          <input id="last-name" name="lastName" /></div>
      </div>`)

    const grid = (await page.locator('.form-grid').boundingBox())!
    const onWrapper = { x: grid.x + 5, y: grid.y + 5 }   // padding, not a field
    expect(await fieldAt(onWrapper.x, onWrapper.y)).toBeNull()

    const result = await snapToFormField(page, onWrapper.x, onWrapper.y, 'Last Name input field')
    expect(await fieldAt(result.x, result.y)).toBe('last-name')
  })

  it('corrects coordinates that land on nothing at all', async () => {
    const result = await snapToFormField(page, 1200, 700, 'Emergency Contact Phone input field')
    expect(await fieldAt(result.x, result.y)).toBe('emergency-phone')
  })

  it('returns coordinates inside the viewport', async () => {
    // The failing run stored y = -329, which no click can reach.
    const wrong = await centreOf('#email')
    const result = await snapToFormField(page, wrong.x, wrong.y, 'Emergency Contact Phone input field')

    expect(result.y).toBeGreaterThanOrEqual(0)
    expect(result.y).toBeLessThanOrEqual(720)
  })
})

/**
 * The fill-verification path used to carry its own copy of this heuristic. It
 * kept resolving "Emergency Contact Phone" to #phone, reported the fill as
 * failed, then RE-FILLED #phone with the emergency number — overwriting the
 * patient's real phone. Both paths now share one matcher.
 */
describe('findFieldByDescription', () => {
  const keywords = (d: string) =>
    d.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !['input', 'box', 'field', 'the', 'for', 'and'].includes(w))

  it('resolves the emergency phone, not the plain phone', async () => {
    const match = await findFieldByDescription(page, keywords('Emergency Contact Phone field'))
    expect(match?.id).toBe('emergency-phone')
  })

  it('still resolves the plain phone when that is what was asked for', async () => {
    const match = await findFieldByDescription(page, keywords('Phone Number field'))
    expect(match?.id).toBe('phone')
  })

  it('agrees with the coordinate-correction path', async () => {
    // The two used to disagree, which is what corrupted the record.
    const description = 'Emergency Contact Phone field'
    const match = await findFieldByDescription(page, keywords(description))
    const snapped = await snapToFormField(page, 1200, 700, description)

    const snappedId = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return (el?.closest('input, select, textarea') as HTMLElement | null)?.id ?? null
    }, { x: snapped.x, y: snapped.y })

    expect(snappedId).toBe(match?.id)
  })

  it('reports the value it found, for fill verification', async () => {
    await page.fill('#emergency-phone', '(617) 555-7713')
    const match = await findFieldByDescription(page, keywords('Emergency Contact Phone field'))
    expect(match?.value).toBe('(617) 555-7713')
  })

  it('returns null when the description shares no vocabulary with any field', async () => {
    expect(await findFieldByDescription(page, keywords('Passport field'))).toBeNull()
  })

  it('matches on a single distinctive keyword', async () => {
    // "Gender dropdown" carries only one meaningful word, so a match must not
    // require multiple keyword hits.
    await page.setContent('<label for="gender">Gender</label><select id="gender"><option>Male</option></select>')
    const match = await findFieldByDescription(page, keywords('Gender dropdown'))
    expect(match?.id).toBe('gender')
  })
})
