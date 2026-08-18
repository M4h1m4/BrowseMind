interface PendingHandoff {
  resolve: (notes: string) => void
  reject:  (err: Error) => void
}

const handoffs = new Map<string, PendingHandoff>()

export function waitForHandoff(runId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    handoffs.set(runId, { resolve, reject })
  })
}

export function signalHandoff(runId: string, humanNotes: string): boolean {
  const h = handoffs.get(runId)
  if (!h) return false
  handoffs.delete(runId)
  h.resolve(humanNotes)
  return true
}

export function cancelHandoff(runId: string): void {
  const h = handoffs.get(runId)
  if (!h) return
  handoffs.delete(runId)
  h.reject(new Error(`run ${runId} handoff cancelled`))
}

export function resetHandoffs(): void {
  handoffs.clear()
}
