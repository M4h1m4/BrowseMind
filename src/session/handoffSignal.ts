interface PendingHandoff {
  resolve: (notes: string) => void
  reject:  (err: Error) => void
}

// Resolved before waitForHandoff was called — stored so the next waitForHandoff can consume immediately
interface EarlySignal {
  kind:  'resolve'
  notes: string
}
interface EarlyCancellation {
  kind: 'reject'
}

const handoffs     = new Map<string, PendingHandoff>()
const earlySignals = new Map<string, EarlySignal | EarlyCancellation>()

export function waitForHandoff(runId: string): Promise<string> {
  // If a signal/cancel arrived before we started waiting, consume it immediately
  const early = earlySignals.get(runId)
  if (early) {
    earlySignals.delete(runId)
    if (early.kind === 'resolve') return Promise.resolve(early.notes)
    return Promise.reject(new Error(`run ${runId} handoff cancelled`))
  }

  return new Promise((resolve, reject) => {
    handoffs.set(runId, { resolve, reject })
  })
}

export function signalHandoff(runId: string, humanNotes: string): boolean {
  const h = handoffs.get(runId)
  if (!h) {
    // Store for when waitForHandoff is called later
    earlySignals.set(runId, { kind: 'resolve', notes: humanNotes })
    return false
  }
  handoffs.delete(runId)
  h.resolve(humanNotes)
  return true
}

export function cancelHandoff(runId: string): void {
  const h = handoffs.get(runId)
  if (!h) {
    // Store for when waitForHandoff is called later
    earlySignals.set(runId, { kind: 'reject' })
    return
  }
  handoffs.delete(runId)
  h.reject(new Error(`run ${runId} handoff cancelled`))
}

export function resetHandoffs(): void {
  handoffs.clear()
  earlySignals.clear()
}
