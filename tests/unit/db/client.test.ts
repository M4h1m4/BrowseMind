import { initDb, getDb, closeDb } from '../../../src/db/client'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
  closeDb()
})

afterEach(() => {
  closeDb()
})

describe('initDb', () => {
  it('creates the artifacts table', () => {
    initDb()
    const db = getDb()
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'"
    ).get()
    expect(row).toBeDefined()
  })

  it('creates the sessions table', () => {
    initDb()
    const db = getDb()
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).get()
    expect(row).toBeDefined()
  })

  it('creates the runs table', () => {
    initDb()
    const db = getDb()
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='runs'"
    ).get()
    expect(row).toBeDefined()
  })

  it('is idempotent — running twice does not throw', () => {
    expect(() => {
      initDb()
      initDb()
    }).not.toThrow()
  })
})

describe('getDb', () => {
  it('returns the same instance on repeated calls', () => {
    initDb()
    const a = getDb()
    const b = getDb()
    expect(a).toBe(b)
  })
})

describe('closeDb', () => {
  it('allows re-initialization after close', () => {
    initDb()
    closeDb()
    expect(() => initDb()).not.toThrow()
  })
})
