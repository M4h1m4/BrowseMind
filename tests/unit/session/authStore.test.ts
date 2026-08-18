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
    expect(getAuthState('unknown.com')).toBeUndefined()
  })

  it('returns the stored auth state for a domain', () => {
    const state = makeAuthState()
    storeAuthState('example.com', state)
    expect(getAuthState('example.com')).toEqual(state)
  })

  it('overwrites an existing entry when called again for the same domain', () => {
    storeAuthState('example.com', makeAuthState())
    const updated = makeAuthState()
    updated.localStorage = { token: 'new-token' }
    storeAuthState('example.com', updated)
    expect(getAuthState('example.com')?.localStorage.token).toBe('new-token')
  })

  it('keeps states for different domains isolated', () => {
    storeAuthState('example.com', makeAuthState('example.com'))
    storeAuthState('other.com', makeAuthState('other.com'))
    expect(getAuthState('example.com')?.domain).toBe('example.com')
    expect(getAuthState('other.com')?.domain).toBe('other.com')
  })
})

describe('clearAuthState', () => {
  it('removes the entry for the given domain', () => {
    storeAuthState('example.com', makeAuthState())
    clearAuthState('example.com')
    expect(getAuthState('example.com')).toBeUndefined()
  })

  it('does not affect other domains when clearing one', () => {
    storeAuthState('example.com', makeAuthState('example.com'))
    storeAuthState('other.com', makeAuthState('other.com'))
    clearAuthState('example.com')
    expect(getAuthState('other.com')).toBeDefined()
  })
})

describe('clearAllAuthState', () => {
  it('removes all stored auth states', () => {
    storeAuthState('a.com', makeAuthState('a.com'))
    storeAuthState('b.com', makeAuthState('b.com'))
    clearAllAuthState()
    expect(getAuthState('a.com')).toBeUndefined()
    expect(getAuthState('b.com')).toBeUndefined()
  })
})
