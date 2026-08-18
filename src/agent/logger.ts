import fs from 'fs'
import path from 'path'
import { RunLog, RunStepLog } from '../types'

export function writeRunLog(log: RunLog): void {
  const runsDir = path.join(process.cwd(), 'evidence', 'runs')
  fs.mkdirSync(runsDir, { recursive: true })
  const filePath = path.join(runsDir, `${log.runId}.json`)
  fs.writeFileSync(filePath, JSON.stringify(sanitiseLog(log), null, 2))
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
