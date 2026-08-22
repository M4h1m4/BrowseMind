import {
  storeAuthState,
  getAuthState,
  clearAuthState,
  clearAllAuthState,
  AuthState
} from '../../../src/session/authStore'

function makeAuthState(domain = 'example.com'): AuthState {
  return {
    domain,
    cookies: [
      {
        name: 'session', value: 'abc123', domain, path: '/',
        expires: -1, httpOnly: true, secure: false, sameSite: 'Lax'
      }
    ],
    localStorage: { token: 'jwt-token-xyz', theme: 'dark' },
    capturedAt:   new Date().toISOString()
  }
}

beforeEach(() => clearAllAuthState())

describe('storeAuthState / getAuthState', () => {
  it('returns undefined when no state has been stored for a domain', () => {
    expect(getAuthState('tenant-001', 'unknown.com')).toBeUndefined()
  })

  it('returns the stored auth state for a domain', () => {
    const state = makeAuthState()
    storeAuthState('tenant-001', 'example.com', state)
    expect(getAuthState('tenant-001', 'example.com')).toEqual(state)
  })

  it('overwrites an existing entry when called again for the same domain', () => {
    storeAuthState('tenant-001', 'example.com', makeAuthState())
    const updated = makeAuthState()
    updated.localStorage = { token: 'new-token' }
    storeAuthState('tenant-001', 'example.com', updated)
    expect(getAuthState('tenant-001', 'example.com')?.localStorage.token).toBe('new-token')
  })

  it('keeps states for different domains isolated', () => {
    storeAuthState('tenant-001', 'example.com', makeAuthState('example.com'))
    storeAuthState('tenant-001', 'other.com', makeAuthState('other.com'))
    expect(getAuthState('tenant-001', 'example.com')?.domain).toBe('example.com')
    expect(getAuthState('tenant-001', 'other.com')?.domain).toBe('other.com')
  })
})

describe('clearAuthState', () => {
  it('removes the entry for the given domain', () => {
    storeAuthState('tenant-001', 'example.com', makeAuthState())
    clearAuthState('tenant-001', 'example.com')
    expect(getAuthState('tenant-001', 'example.com')).toBeUndefined()
  })

  it('does not affect other domains when clearing one', () => {
    storeAuthState('tenant-001', 'example.com', makeAuthState('example.com'))
    storeAuthState('tenant-001', 'other.com', makeAuthState('other.com'))
    clearAuthState('tenant-001', 'example.com')
    expect(getAuthState('tenant-001', 'other.com')).toBeDefined()
  })
})

describe('clearAllAuthState', () => {
  it('removes all stored auth states', () => {
    storeAuthState('tenant-001', 'a.com', makeAuthState('a.com'))
    storeAuthState('tenant-001', 'b.com', makeAuthState('b.com'))
    clearAllAuthState()
    expect(getAuthState('tenant-001', 'a.com')).toBeUndefined()
    expect(getAuthState('tenant-001', 'b.com')).toBeUndefined()
  })
})

/**
 * Entries here are captured login sessions — real cookies for a real account on
 * the target site. Keyed by domain alone, one tenant's replay would silently
 * reuse another tenant's credentials on any site both automate.
 */
describe('tenant isolation', () => {
  const stateFor = (who: string) => ({
    domain:       'app.example.com',
    cookies:      [{ name: 'session', value: who }] as any,
    localStorage: {},
    capturedAt:   new Date().toISOString()
  })

  it('does not leak one tenant\'s login to another on the same domain', () => {
    storeAuthState('tenant-a', 'app.example.com', stateFor('tenant-a-secret'))
    expect(getAuthState('tenant-b', 'app.example.com')).toBeUndefined()
  })

  it('keeps both tenants\' logins side by side', () => {
    storeAuthState('tenant-a', 'app.example.com', stateFor('a'))
    storeAuthState('tenant-b', 'app.example.com', stateFor('b'))
    expect(getAuthState('tenant-a', 'app.example.com')?.cookies[0].value).toBe('a')
    expect(getAuthState('tenant-b', 'app.example.com')?.cookies[0].value).toBe('b')
  })

  it('clearing one tenant leaves the other intact', () => {
    storeAuthState('tenant-a', 'app.example.com', stateFor('a'))
    storeAuthState('tenant-b', 'app.example.com', stateFor('b'))
    clearAuthState('tenant-a', 'app.example.com')
    expect(getAuthState('tenant-a', 'app.example.com')).toBeUndefined()
    expect(getAuthState('tenant-b', 'app.example.com')).toBeDefined()
  })
})
