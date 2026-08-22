import { locateElement, scrollCoordinatesIntoView } from '../../../src/replay/elementLocator'
import { ElementData } from '../../../src/types'

const VIEWPORT = { width: 1280, height: 720 }

function makeElementData(overrides: Partial<ElementData> = {}): ElementData {
  return {
    primary:   { type: 'aria-label',   value: 'Submit' },
    secondary: { type: 'placeholder',  value: 'Enter name' },
    tertiary:  { type: 'text-content', value: 'Click here' },
    fallback:  { type: 'coordinates',  value: { x: 100, y: 200 } },
    ...overrides
  }
}

type Box = { x: number; y: number; width: number; height: number } | null

/** A locator that resolves to `box`, or throws / reports no match. */
function makeLocator(box: Box | 'throw' | 'absent') {
  return {
    count:                  jest.fn().mockResolvedValue(box === 'absent' ? 0 : 1),
    scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined),
    boundingBox:            box === 'throw'
      ? jest.fn().mockRejectedValue(new Error('not found'))
      : jest.fn().mockResolvedValue(box === 'absent' ? null : box)
  }
}

/** A page whose every locator() call resolves the same way. */
function makeMockPage(box: Box = { x: 50, y: 80, width: 100, height: 40 }) {
  const first = makeLocator(box)
  return {
    page: {
      locator:      jest.fn().mockReturnValue({ first: () => first }),
      viewportSize: () => VIEWPORT,
      evaluate:     jest.fn().mockResolvedValue(0)
    } as any,
    first
  }
}

/** A page that answers successive locator() calls differently. */
function makeSequencedPage(...locators: ReturnType<typeof makeLocator>[]) {
  const locator = jest.fn()
  for (const l of locators) locator.mockReturnValueOnce({ first: () => l })
  locator.mockReturnValue({ first: () => makeLocator('throw') })
  return {
    locator,
    viewportSize: () => VIEWPORT,
    evaluate:     jest.fn().mockResolvedValue(0)
  } as any
}

describe('locateElement', () => {
  it('returns primary strategy when aria-label element is found', async () => {
    const { page } = makeMockPage({ x: 50, y: 80, width: 100, height: 40 })
    const result = await locateElement(page, makeElementData())

    expect(result.strategy).toBe('primary')
    expect(result.x).toBe(100)  // 50 + 100/2
    expect(result.y).toBe(100)  // 80 + 40/2
  })

  it('scrolls the element into view before measuring it', async () => {
    // Without this, an element below the fold measures at a coordinate outside
    // the viewport, where clicks land on nothing.
    const { page, first } = makeMockPage()
    await locateElement(page, makeElementData())
    expect(first.scrollIntoViewIfNeeded).toHaveBeenCalled()
  })

  it('returns a locator handle alongside the coordinates', async () => {
    const { page, first } = makeMockPage()
    const result = await locateElement(page, makeElementData())
    expect(result.locator).toBe(first)
  })

  it('falls through to secondary when primary boundingBox returns null', async () => {
    const page = makeSequencedPage(
      makeLocator('absent'),
      makeLocator({ x: 10, y: 20, width: 60, height: 20 })
    )
    const result = await locateElement(page, makeElementData())
    expect(result.strategy).toBe('secondary')
    expect(result.x).toBe(40)  // 10 + 60/2
    expect(result.y).toBe(30)  // 20 + 20/2
  })

  it('falls through to tertiary when primary and secondary both fail', async () => {
    const page = makeSequencedPage(
      makeLocator('throw'),
      makeLocator('throw'),
      makeLocator({ x: 0, y: 0, width: 80, height: 20 })
    )
    const result = await locateElement(page, makeElementData())
    expect(result.strategy).toBe('tertiary')
  })

  it('returns fallback coordinates when all strategies fail', async () => {
    const page = makeSequencedPage(
      makeLocator('throw'), makeLocator('throw'), makeLocator('throw')
    )
    const result = await locateElement(page, makeElementData())
    expect(result.strategy).toBe('fallback')
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
    expect(result.locator).toBeUndefined()
  })

  it('skips primary when primary value is empty and tries secondary', async () => {
    const { page } = makeMockPage({ x: 5, y: 10, width: 40, height: 20 })
    const elementData = makeElementData({ primary: { type: 'aria-label', value: '' } })
    const result = await locateElement(page, elementData)

    expect(result.strategy).toBe('secondary')
  })

  it('computes center coordinates correctly from bounding box', async () => {
    const { page } = makeMockPage({ x: 200, y: 300, width: 120, height: 60 })
    const result = await locateElement(page, makeElementData())

    expect(result.x).toBe(260)  // 200 + 120/2
    expect(result.y).toBe(330)  // 300 + 60/2
  })
})

describe('scrollCoordinatesIntoView', () => {
  it('leaves an on-screen coordinate untouched', async () => {
    const page = { viewportSize: () => VIEWPORT, evaluate: jest.fn() } as any
    const result = await scrollCoordinatesIntoView(page, 300, 400)
    expect(result).toEqual({ x: 300, y: 400, scrolled: false })
    expect(page.evaluate).not.toHaveBeenCalled()
  })

  it('scrolls a below-the-fold coordinate into the viewport', async () => {
    // Capture recorded y=1612; the page must move for that point to be clickable.
    const page = {
      viewportSize: () => VIEWPORT,
      evaluate:     jest.fn().mockResolvedValue(1252)   // actual scroll applied
    } as any
    const result = await scrollCoordinatesIntoView(page, 326, 1612)
    expect(result.scrolled).toBe(true)
    expect(result.y).toBe(360)                          // 1612 - 1252, now on screen
    expect(result.y).toBeLessThan(VIEWPORT.height)
  })

  it('reports the real scroll distance when the page cannot scroll that far', async () => {
    const page = {
      viewportSize: () => VIEWPORT,
      evaluate:     jest.fn().mockResolvedValue(0)      // already at the bottom
    } as any
    const result = await scrollCoordinatesIntoView(page, 326, 1612)
    expect(result.scrolled).toBe(false)
    expect(result.y).toBe(1612)
  })
})
