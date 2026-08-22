import fs from 'fs'
import path from 'path'
import { Router } from 'express'

export const uiRouter = Router()

// The evidence directory is deliberately NOT mounted here.
//
// It holds run logs and step screenshots — the goal text, every value typed into
// every field, and images of the filled form. Served as a static directory it was
// readable by anyone who could reach the port, with no authentication and no
// check that the caller owned the run. Evidence is now reached only through
// /api/v1/runs/:runId/… , which is behind the API key and verifies the run's
// tenant before returning anything.

// Serve the operator UI HTML
uiRouter.get('/', (_req, res) => {
  // In ts-node (dev), __dirname is src/ui/
  // In compiled mode (dist/ui/), postbuild copies index.html there too
  const htmlPath = path.join(__dirname, 'index.html')
  if (!fs.existsSync(htmlPath)) {
    res.status(500).send('UI not built — run: cp src/ui/index.html dist/ui/index.html')
    return
  }
  res.sendFile(htmlPath)
})
