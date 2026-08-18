interface PendingSignal {
  resolve: () => void
  reject:  (err: Error) => void
}

const signals = new Map<string, PendingSignal>()

export function waitForResume(runId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    signals.set(runId, { resolve, reject })
  })
}

export function signalResume(runId: string): boolean {
  const signal = signals.get(runId)
  if (!signal) return false
  signals.delete(runId)
  signal.resolve()
  return true
}

export function cancelResume(runId: string): void {
  const signal = signals.get(runId)
  if (!signal) return
  signals.delete(runId)
  signal.reject(new Error(`run ${runId} was cancelled while waiting for human login`))
}

export function resetSignals(): void {
  signals.clear()
}
