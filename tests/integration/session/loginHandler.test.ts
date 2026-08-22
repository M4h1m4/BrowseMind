/**
 * loginHandler integration tests
 *
 * Uses a mocked Playwright page/context to verify that:
 *   - captureAndStoreAuthState stores cookies and localStorage in the auth store
 */

import { captureAndStoreAuthState } from '../../../src/session/loginHandler'
import { getAuthState, clearAllAuthState } from '../../../src/session/authStore'

// ─── Mock Playwright ──────────────────────────────────────────────────────────

const mockCookies  = jest.fn()
const mockEvaluate = jest.fn()

const mockPage = {
  evaluate: mockEvaluate
} as any

const mockContext = {
  cookies: mockCookies,
} as any

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearAllAuthState()
  jest.clearAllMocks()
})

describe('captureAndStoreAuthState', () => {
  it('stores cookies and localStorage under the target domain', async () => {
    const fakeCookies = [
      { name: 'session', value: 'abc', domain: 'example.com', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }
    ]
    mockCookies.mockResolvedValue(fakeCookies)
    mockEvaluate.mockResolvedValue({ token: 'jwt-xyz' })

    await captureAndStoreAuthState(mockContext, mockPage, 'https://example.com', 'tenant-001')

    const stored = getAuthState('tenant-001', 'example.com')
    expect(stored).toBeDefined()
    expect(stored?.cookies).toEqual(fakeCookies)
    expect(stored?.localStorage).toEqual({ token: 'jwt-xyz' })
    expect(stored?.domain).toBe('example.com')
  })

  it('uses the hostname of the targetApp as the store key', async () => {
    mockCookies.mockResolvedValue([])
    mockEvaluate.mockResolvedValue({})

    await captureAndStoreAuthState(mockContext, mockPage, 'https://api.example.com/data', 'tenant-001')

    expect(getAuthState('tenant-001', 'api.example.com')).toBeDefined()
    expect(getAuthState('tenant-001', 'example.com')).toBeUndefined()
  })
})
