import { locateElement } from '../../../src/replay/elementLocator'
import { ElementData } from '../../../src/types'

function makeElementData(overrides: Partial<ElementData> = {}): ElementData {
  return {
    primary:   { type: 'aria-label',   value: 'Submit' },
    secondary: { type: 'placeholder',  value: 'Enter name' },
    tertiary:  { type: 'text-content', value: 'Click here' },
    fallback:  { type: 'coordinates',  value: { x: 100, y: 200 } },
    ...overrides
  }
}

function makeMockPage(boundingBoxResult: { x: number; y: number; width: number; height: number } | null = { x: 50, y: 80, width: 100, height: 40 }) {
  const mockFirst = { boundingBox: jest.fn().mockResolvedValue(boundingBoxResult) }
  const mockLocator = { first: jest.fn().mockReturnValue(mockFirst) }
  return {
    page:     { locator: jest.fn().mockReturnValue(mockLocator) } as any,
    mockFirst,
    mockLocator
  }
}

describe('locateElement', () => {
  it('returns primary strategy when aria-label element is found', async () => {
    const { page } = makeMockPage({ x: 50, y: 80, width: 100, height: 40 })
    const result = await locateElement(page, makeElementData())

    expect(result.strategy).toBe('primary')
    expect(result.x).toBe(100)  // 50 + 100/2
    expect(result.y).toBe(100)  // 80 + 40/2
  })

  it('falls through to secondary when primary boundingBox returns null', async () => {
    const mockSecondFirst = { boundingBox: jest.fn().mockResolvedValue({ x: 10, y: 20, width: 60, height: 20 }) }
    const mockPrimaryFirst = { boundingBox: jest.fn().mockResolvedValue(null) }

    const mockPage = {
      locator: jest.fn()
        .mockReturnValueOnce({ first: () => mockPrimaryFirst })   // primary call
        .mockReturnValueOnce({ first: () => mockSecondFirst })    // secondary call
    } as any

    const result = await locateElement(mockPage, makeElementData())
    expect(result.strategy).toBe('secondary')
    expect(result.x).toBe(40)  // 10 + 60/2
    expect(result.y).toBe(30)  // 20 + 20/2
  })

  it('falls through to tertiary when primary and secondary both fail', async () => {
    const mockTertiaryFirst = { boundingBox: jest.fn().mockResolvedValue({ x: 0, y: 0, width: 80, height: 20 }) }
    const mockFail = { boundingBox: jest.fn().mockRejectedValue(new Error('not found')) }

    const mockPage = {
      locator: jest.fn()
        .mockReturnValueOnce({ first: () => mockFail })            // primary throws
        .mockReturnValueOnce({ first: () => mockFail })            // secondary throws
        .mockReturnValueOnce({ first: () => mockTertiaryFirst })   // tertiary found
    } as any

    const result = await locateElement(mockPage, makeElementData())
    expect(result.strategy).toBe('tertiary')
  })

  it('returns fallback coordinates when all strategies fail', async () => {
    const mockFail = { boundingBox: jest.fn().mockRejectedValue(new Error('not found')) }
    const mockPage = {
      locator: jest.fn().mockReturnValue({ first: () => mockFail })
    } as any

    const result = await locateElement(mockPage, makeElementData())
    expect(result.strategy).toBe('fallback')
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })

  it('skips primary when primary value is empty and tries secondary', async () => {
    const mockSecondFirst = { boundingBox: jest.fn().mockResolvedValue({ x: 5, y: 10, width: 40, height: 20 }) }
    const mockPage = {
      locator: jest.fn().mockReturnValue({ first: () => mockSecondFirst })
    } as any

    const elementData = makeElementData({ primary: { type: 'aria-label', value: '' } })
    const result = await locateElement(mockPage, elementData)

    expect(result.strategy).toBe('secondary')
  })

  it('computes center coordinates correctly from bounding box', async () => {
    const { page } = makeMockPage({ x: 200, y: 300, width: 120, height: 60 })
    const result = await locateElement(page, makeElementData())

    expect(result.x).toBe(260)  // 200 + 120/2
    expect(result.y).toBe(330)  // 300 + 60/2
  })
})
