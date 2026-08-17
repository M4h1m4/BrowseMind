import fs from 'fs'
import path from 'path'
import { RunLog } from '../types'

export function writeRunLog(log: RunLog): void {
  const runsDir = path.join(process.cwd(), 'evidence', 'runs')
  fs.mkdirSync(runsDir, { recursive: true })
  const filePath = path.join(runsDir, `${log.runId}.json`)
  fs.writeFileSync(filePath, JSON.stringify(log, null, 2))
}
