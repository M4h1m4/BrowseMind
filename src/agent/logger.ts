import fs from 'fs'
import path from 'path'
import { RunLog, RunStepLog } from '../types'
import { getDb } from '../db/client'

export function writeRunLog(log: RunLog): void {
  const sanitised = sanitiseLog(log)

  // 1. Write JSON file to evidence/runs/
  const runsDir = path.join(process.cwd(), 'evidence', 'runs')
  fs.mkdirSync(runsDir, { recursive: true })
  const filePath = path.join(runsDir, `${log.runId}.json`)
  fs.writeFileSync(filePath, JSON.stringify(sanitised, null, 2))

  // 2. Persist to SQLite runs table
  try {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO runs (runId, type, status, artifactId, tenantId, startedAt, updatedAt, content)
      VALUES (@runId, @type, @status, @artifactId, @tenantId, @startedAt, @updatedAt, @content)
      ON CONFLICT(runId) DO UPDATE SET
        status    = excluded.status,
        updatedAt = excluded.updatedAt,
        content   = excluded.content
    `).run({
      runId:      log.runId,
      type:       log.type,
      status:     log.status,
      artifactId: log.artifactId ?? null,
      tenantId:   log.tenantId,
      startedAt:  log.startedAt,
      updatedAt:  log.completedAt ?? now,
      content:    JSON.stringify(sanitised)
    })
  } catch (err) {
    console.error(`[logger] failed to persist run ${log.runId} to DB:`, err)
  }
}

/**
 * Returns a copy of the log with sensitive step data scrubbed:
 * - screenshotPath removed (never write credential screens to disk)
 * - errorDetails already redacted by the caller for sensitive steps
 */
function sanitiseLog(log: RunLog): RunLog {
  return {
    ...log,
    steps: log.steps.map((step: RunStepLog) => {
      if (!step.sensitive) return step
      const { screenshotPath: _omit, ...safe } = step
      return safe
    })
  }
}
