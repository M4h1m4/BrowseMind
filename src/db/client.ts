import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = path.join(process.cwd(), 'db', 'artifacts.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
  }
  return db
}

export function initDb(): void {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      artifactId     TEXT PRIMARY KEY,
      tenantId       TEXT NOT NULL,
      baseArtifactId TEXT,
      version        INTEGER NOT NULL DEFAULT 1,
      goal           TEXT NOT NULL,
      targetApp      TEXT NOT NULL,
      createdAt      TEXT NOT NULL,
      content        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      tenantId     TEXT NOT NULL,
      domain       TEXT NOT NULL,
      storageState TEXT NOT NULL,
      savedAt      TEXT NOT NULL,
      PRIMARY KEY (tenantId, domain)
    );

    CREATE TABLE IF NOT EXISTS runs (
      runId      TEXT PRIMARY KEY,
      type       TEXT NOT NULL,
      status     TEXT NOT NULL,
      artifactId TEXT,
      tenantId   TEXT NOT NULL,
      startedAt  TEXT NOT NULL,
      updatedAt  TEXT NOT NULL,
      content    TEXT NOT NULL
    );
  `)

  console.log('[db] initialized — tables: artifacts, sessions, runs')
}
