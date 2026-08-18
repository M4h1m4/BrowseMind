import {
  waitForResume,
  signalResume,
  cancelResume,
  resetSignals,
  LoginCredentials
} from '../../../src/session/resumeSignal'

beforeEach(() => resetSignals())

describe('waitForResume / signalResume', () => {
  it('resolves with credentials when signalResume is called', async () => {
    const creds: LoginCredentials = { username: 'admin', password: 'secret' }

    const promise = waitForResume('run-001')
    signalResume('run-001', creds)

    await expect(promise).resolves.toEqual(creds)
  })

  it('returns true when the signal is delivered to a waiting run', () => {
    waitForResume('run-002')
    const delivered = signalResume('run-002', { username: 'u', password: 'p' })
    expect(delivered).toBe(true)
  })

  it('returns false when there is no waiting run for the given runId', () => {
    const delivered = signalResume('non-existent', { username: 'u', password: 'p' })
    expect(delivered).toBe(false)
  })

  it('cleans up the signal after it is delivered', async () => {
    const promise = waitForResume('run-003')
    signalResume('run-003', { username: 'u', password: 'p' })
    await promise

    // Second signal for same runId should return false (no pending waiter)
    const secondDelivery = signalResume('run-003', { username: 'u2', password: 'p2' })
    expect(secondDelivery).toBe(false)
  })

  it('two concurrent runs resolve independently with their own credentials', async () => {
    const credsA: LoginCredentials = { username: 'alice', password: 'pass-a' }
    const credsB: LoginCredentials = { username: 'bob',   password: 'pass-b' }

    const promiseA = waitForResume('run-A')
    const promiseB = waitForResume('run-B')

    signalResume('run-B', credsB)
    signalResume('run-A', credsA)

    await expect(promiseA).resolves.toEqual(credsA)
    await expect(promiseB).resolves.toEqual(credsB)
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
