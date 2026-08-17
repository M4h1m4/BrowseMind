import { Page } from 'playwright'
import { extractElementData } from '../../../src/agent/extractor'

function makeMockPage(evaluateResult: unknown): Page {
  return {
    evaluate: jest.fn().mockResolvedValue(evaluateResult)
  } as unknown as Page
}

describe('extractElementData', () => {
  it('maps ariaLabel to primary', async () => {
    const page = makeMockPage({ ariaLabel: 'Employee Name', placeholder: '', textContent: '' })
    const result = await extractElementData(page, 100, 200)
    expect(result.primary).toEqual({ type: 'aria-label', value: 'Employee Name' })
  })

  it('maps placeholder to secondary', async () => {
    const page = makeMockPage({ ariaLabel: '', placeholder: 'Type for hints...', textContent: '' })
    const result = await extractElementData(page, 100, 200)
    expect(result.secondary).toEqual({ type: 'placeholder', value: 'Type for hints...' })
  })

  it('maps textContent to tertiary', async () => {
    const page = makeMockPage({ ariaLabel: '', placeholder: '', textContent: 'Search' })
    const result = await extractElementData(page, 100, 200)
    expect(result.tertiary).toEqual({ type: 'text-content', value: 'Search' })
  })

  it('always stores coordinates in fallback regardless of other attributes', async () => {
    const page = makeMockPage({ ariaLabel: 'Label', placeholder: 'hint', textContent: 'text' })
    const result = await extractElementData(page, 400, 300)
    expect(result.fallback).toEqual({ type: 'coordinates', value: { x: 400, y: 300 } })
  })

  it('returns empty strings when element is not found (evaluate returns null)', async () => {
    const page = makeMockPage(null)
    const result = await extractElementData(page, 0, 0)
    expect(result.primary.value).toBe('')
    expect(result.secondary.value).toBe('')
    expect(result.tertiary.value).toBe('')
    expect(result.fallback.value).toEqual({ x: 0, y: 0 })
  })

  it('returns all four strategies in the correct shape', async () => {
    const page = makeMockPage({ ariaLabel: 'a', placeholder: 'b', textContent: 'c' })
    const result = await extractElementData(page, 10, 20)
    expect(result).toHaveProperty('primary')
    expect(result).toHaveProperty('secondary')
    expect(result).toHaveProperty('tertiary')
    expect(result).toHaveProperty('fallback')
    expect(result.fallback.type).toBe('coordinates')
  })

  it('passes the correct coordinates to page.evaluate', async () => {
    const page = makeMockPage(null)
    await extractElementData(page, 123, 456)
    expect((page.evaluate as jest.Mock)).toHaveBeenCalledWith(
      expect.any(Function),
      { x: 123, y: 456 }
    )
  })
})
