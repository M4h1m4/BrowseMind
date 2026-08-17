import { initDb, closeDb } from '../../src/db/client'

export function setupTestDb(): void {
  process.env.DATABASE_PATH = ':memory:'
  closeDb()
  initDb()
}

export function teardownTestDb(): void {
  closeDb()
}
