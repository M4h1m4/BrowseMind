import { Cookie } from 'playwright'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthState {
  domain:       string
  cookies:      Cookie[]
  localStorage: Record<string, string>
  capturedAt:   string
}

// ─── In-memory store — keyed by tenant AND domain ────────────────────────────
// Lives only for the lifetime of the server process.
// On restart the map is empty and users log in again naturally.
//
// The tenant half of the key is load-bearing. These entries are captured login
// sessions — cookies and localStorage for a real account on the target site.
// Keyed by domain alone, one tenant's replay would silently reuse another
// tenant's credentials whenever both automate the same site. The `sessions`
// table has always had a (tenantId, domain) primary key; this store now matches.

const store = new Map<string, AuthState>()

function authKey(tenantId: string, domain: string): string {
  return `${tenantId}\u0000${domain}`
}

export function storeAuthState(tenantId: string, domain: string, state: AuthState): void {
  store.set(authKey(tenantId, domain), state)
}

export function getAuthState(tenantId: string, domain: string): AuthState | undefined {
  return store.get(authKey(tenantId, domain))
}

export function clearAuthState(tenantId: string, domain: string): void {
  store.delete(authKey(tenantId, domain))
}

/** Clear everything — used in tests only. */
export function clearAllAuthState(): void {
  store.clear()
}
