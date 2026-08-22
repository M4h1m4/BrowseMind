import { verifyCheckpoint } from '../../../src/replay/checkpointVerifier'
import { Checkpoint } from '../../../src/types'

function makeMockPage(url = 'https://example.com/dashboard', elementVisible = true) {
  const mockLocatorResult = {
    first:     jest.fn().mockReturnThis(),
    isVisible: jest.fn().mockResolvedValue(elementVisible)
  }
  return {
    url:     jest.fn().mockReturnValue(url),
    locator: jest.fn().mockReturnValue(mockLocatorResult)
  } as any
}

describe('verifyCheckpoint', () => {
  describe('url-contains', () => {
    it('returns true when URL contains the expected fragment', async () => {
      const page = makeMockPage('https://example.com/dashboard')
      const checkpoint: Checkpoint = { type: 'url-contains', value: '/dashboard' }
      expect(await verifyCheckpoint(page, checkpoint)).toBe(true)
    })

    it('returns false when URL does not contain the expected fragment', async () => {
      const page = makeMockPage('https://example.com/login')
      const checkpoint: Checkpoint = { type: 'url-contains', value: '/dashboard' }
      expect(await verifyCheckpoint(page, checkpoint)).toBe(false)
    })

    it('does not call locator for url-contains', async () => {
      const page = makeMockPage()
      await verifyCheckpoint(page, { type: 'url-contains', value: '/dashboard' })
      expect(page.locator).not.toHaveBeenCalled()
    })
  })

  describe('text-present', () => {
    it('returns true when text is visible on page', async () => {
      const page = makeMockPage('https://example.com', true)
      const checkpoint: Checkpoint = { type: 'text-present', value: 'Welcome back' }
      expect(await verifyCheckpoint(page, checkpoint)).toBe(true)
    })

    it('returns false when text is not visible', async () => {
      const page = makeMockPage('https://example.com', false)
      const checkpoint: Checkpoint = { type: 'text-present', value: 'Welcome back' }
      expect(await verifyCheckpoint(page, checkpoint)).toBe(false)
    })

    it('returns false when isVisible throws', async () => {
      const page = {
        url:     jest.fn(),
        locator: jest.fn().mockReturnValue({
          first:     jest.fn().mockReturnThis(),
          isVisible: jest.fn().mockRejectedValue(new Error('timeout'))
        })
      } as any
      const checkpoint: Checkpoint = { type: 'text-present', value: 'Some text' }
      expect(await verifyCheckpoint(page, checkpoint)).toBe(false)
    })
  })

  describe('element-visible', () => {
    it('returns true when element matching selector is visible', async () => {
      const page = makeMockPage('https://example.com', true)
      const checkpoint: Checkpoint = { type: 'element-visible', value: '.employee-list' }
      expect(await verifyCheckpoint(page, checkpoint)).toBe(true)
    })

    it('returns false when element is not visible', async () => {
      const page = makeMockPage('https://example.com', false)
      const checkpoint: Checkpoint = { type: 'element-visible', value: '.employee-list' }
      expect(await verifyCheckpoint(page, checkpoint)).toBe(false)
    })

    it('passes the selector value directly to locator', async () => {
      const page = makeMockPage()
      await verifyCheckpoint(page, { type: 'element-visible', value: '#main-table' })
      expect(page.locator).toHaveBeenCalledWith('#main-table')
    })
  })
})
