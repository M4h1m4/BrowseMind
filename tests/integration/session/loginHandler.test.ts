/**
 * loginHandler integration tests
 *
 * Uses a mocked Playwright page/context to verify that:
 *   - performLogin fills the username and password fields and submits
 *   - captureAndStoreAuthState stores cookies and localStorage in the auth store
 */

import { performLogin, captureAndStoreAuthState } from '../../../src/session/loginHandler'
import { getAuthState, clearAllAuthState } from '../../../src/session/authStore'

// ─── Mock Playwright ──────────────────────────────────────────────────────────

const mockFill   = jest.fn().mockResolvedValue(undefined)
const mockClick  = jest.fn().mockResolvedValue(undefined)
const mockPress  = jest.fn().mockResolvedValue(undefined)
const mockIsVisible = jest.fn()

const mockLocator = jest.fn().mockReturnValue({
  first:     jest.fn().mockReturnValue({
    isVisible: mockIsVisible,
    click:     mockClick,
    fill:      mockFill
  })
})

const mockPage = {
  locator:  mockLocator,
  keyboard: { press: mockPress },
  waitForTimeout: jest.fn().mockResolvedValue(undefined)
} as any

const mockCookies = jest.fn()
const mockEvaluate = jest.fn()

const mockContext = {
  cookies:  mockCookies,
} as any

// Attach evaluate to the page (captureAndStoreAuthState uses page.evaluate)
mockPage.evaluate = mockEvaluate

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearAllAuthState()
  jest.clearAllMocks()
  // Default: first visible selector wins
  mockIsVisible.mockResolvedValue(true)
})

describe('performLogin', () => {
  it('fills the username and password fields and presses Enter', async () => {
    await performLogin(mockPage, { username: 'admin', password: 'secret123' })

    // fill should have been called twice — once for username, once for password
    expect(mockFill).toHaveBeenCalledWith('admin')
    expect(mockFill).toHaveBeenCalledWith('secret123')
    expect(mockPress).toHaveBeenCalledWith('Enter')
  })

  it('still calls keyboard.press(Enter) even if no visible fields found', async () => {
    mockIsVisible.mockResolvedValue(false)
    await performLogin(mockPage, { username: 'u', password: 'p' })
    expect(mockPress).toHaveBeenCalledWith('Enter')
  })
})

describe('captureAndStoreAuthState', () => {
  it('stores cookies and localStorage under the target domain', async () => {
    const fakeCookies = [
      { name: 'session', value: 'abc', domain: 'example.com', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }
    ]
    mockCookies.mockResolvedValue(fakeCookies)
    mockEvaluate.mockResolvedValue({ token: 'jwt-xyz' })

    await captureAndStoreAuthState(mockContext, mockPage, 'https://example.com')

    const stored = getAuthState('example.com')
    expect(stored).toBeDefined()
    expect(stored?.cookies).toEqual(fakeCookies)
    expect(stored?.localStorage).toEqual({ token: 'jwt-xyz' })
    expect(stored?.domain).toBe('example.com')
  })

  it('uses the hostname of the targetApp as the store key', async () => {
    mockCookies.mockResolvedValue([])
    mockEvaluate.mockResolvedValue({})

    await captureAndStoreAuthState(mockContext, mockPage, 'https://api.example.com/data')

    expect(getAuthState('api.example.com')).toBeDefined()
    expect(getAuthState('example.com')).toBeUndefined()
  })
})
