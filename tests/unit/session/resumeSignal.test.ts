import {
  waitForResume,
  signalResume,
  cancelResume,
  resetSignals
} from '../../../src/session/resumeSignal'

beforeEach(() => resetSignals())

describe('waitForResume / signalResume', () => {
  it('resolves when signalResume is called', async () => {
    const promise = waitForResume('run-001')
    signalResume('run-001')

    await expect(promise).resolves.toBeUndefined()
  })

  it('returns true when the signal is delivered to a waiting run', () => {
    waitForResume('run-002')
    const delivered = signalResume('run-002')
    expect(delivered).toBe(true)
  })

  it('returns false when there is no waiting run for the given runId', () => {
    const delivered = signalResume('non-existent')
    expect(delivered).toBe(false)
  })

  it('cleans up the signal after it is delivered', async () => {
    const promise = waitForResume('run-003')
    signalResume('run-003')
    await promise

    // Second signal for same runId should return false (no pending waiter)
    const secondDelivery = signalResume('run-003')
    expect(secondDelivery).toBe(false)
  })

  it('two concurrent runs resolve independently', async () => {
    const promiseA = waitForResume('run-A')
    const promiseB = waitForResume('run-B')

    signalResume('run-B')
    signalResume('run-A')

    await expect(promiseA).resolves.toBeUndefined()
    await expect(promiseB).resolves.toBeUndefined()
  })
})

describe('cancelResume', () => {
  it('rejects the pending promise with an error', async () => {
    const promise = waitForResume('run-cancel')
    cancelResume('run-cancel')
    await expect(promise).rejects.toThrow('run-cancel')
  })

  it('does nothing when there is no pending signal for the runId', () => {
    expect(() => cancelResume('no-such-run')).not.toThrow()
  })
})
