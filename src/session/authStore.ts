import { Cookie } from 'playwright'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthState {
  domain:       string
  cookies:      Cookie[]
  localStorage: Record<string, string>
  capturedAt:   string
}

// ─── In-memory store — keyed by domain (hostname) ────────────────────────────
// Lives only for the lifetime of the server process.
// On restart the map is empty and users log in again naturally.

const store = new Map<string, AuthState>()

export function storeAuthState(domain: string, state: AuthState): void {
  store.set(domain, state)
}

export function getAuthState(domain: string): AuthState | undefined {
  return store.get(domain)
}

export function clearAuthState(domain: string): void {
  store.delete(domain)
}

/** Clear everything — used in tests only. */
export function clearAllAuthState(): void {
  store.clear()
}
