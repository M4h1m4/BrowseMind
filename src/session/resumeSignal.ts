// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoginCredentials {
  username: string
  password: string
}

// ─── Signal store — keyed by runId ───────────────────────────────────────────

interface PendingSignal {
  resolve: (creds: LoginCredentials) => void
  reject:  (err: Error) => void
}

const signals = new Map<string, PendingSignal>()

/**
 * Called by the discovery loop when it hits `requiresLogin`.
 * Returns a Promise that resolves when `signalResume` is called with credentials.
 */
export function waitForResume(runId: string): Promise<LoginCredentials> {
  return new Promise((resolve, reject) => {
    signals.set(runId, { resolve, reject })
  })
}

/**
 * Called by the resume API route.
 * Delivers credentials to the waiting discovery loop.
 */
export function signalResume(runId: string, creds: LoginCredentials): boolean {
  const signal = signals.get(runId)
  if (!signal) return false
  signals.delete(runId)
  signal.resolve(creds)
  return true
}

/**
 * Cancel a pending resume — rejects the promise with an error.
 * Useful if the run is abandoned while waiting for credentials.
 */
export function cancelResume(runId: string): void {
  const signal = signals.get(runId)
  if (!signal) return
  signals.delete(runId)
  signal.reject(new Error(`run ${runId} was cancelled while waiting for credentials`))
}

/** Clear all signals — used in tests only. */
export function resetSignals(): void {
  signals.clear()
}
