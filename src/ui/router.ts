import fs from 'fs'
import path from 'path'
import { Router } from 'express'
import express from 'express'

export const uiRouter = Router()

// Serve evidence/ directory so screenshots and run logs are browser-accessible
// fallthrough: false sends a proper 404 instead of passing to the JSON catch-all
uiRouter.use(
  '/evidence',
  express.static(path.join(process.cwd(), 'evidence'), { fallthrough: false })
)

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
