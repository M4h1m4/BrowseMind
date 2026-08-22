import { waitForHandoff, signalHandoff, cancelHandoff, resetHandoffs } from '../../../src/session/handoffSignal'

beforeEach(() => resetHandoffs())

describe('waitForHandoff / signalHandoff', () => {
  it('resolves with human notes when signalHandoff is called', async () => {
    const promise = waitForHandoff('run-001')
    signalHandoff('run-001', 'I clicked the button manually')
    await expect(promise).resolves.toBe('I clicked the button manually')
  })

  it('returns true when signal delivered to a waiting run', () => {
    waitForHandoff('run-002')
    expect(signalHandoff('run-002', 'done')).toBe(true)
  })

  it('returns false when no waiting run', () => {
    expect(signalHandoff('non-existent', 'notes')).toBe(false)
  })

  it('cleans up after delivery', async () => {
    const p = waitForHandoff('run-003')
    signalHandoff('run-003', 'done')
    await p
    expect(signalHandoff('run-003', 'again')).toBe(false)
  })

  it('two concurrent runs resolve with their own notes', async () => {
    const pA = waitForHandoff('run-A')
    const pB = waitForHandoff('run-B')
    signalHandoff('run-B', 'notes-B')
    signalHandoff('run-A', 'notes-A')
    await expect(pA).resolves.toBe('notes-A')
    await expect(pB).resolves.toBe('notes-B')
  })
})

describe('cancelHandoff', () => {
  it('rejects the pending promise', async () => {
    const p = waitForHandoff('run-cancel')
    cancelHandoff('run-cancel')
    await expect(p).rejects.toThrow('run-cancel')
  })

  it('does nothing when no pending handoff', () => {
    expect(() => cancelHandoff('ghost')).not.toThrow()
  })
})
