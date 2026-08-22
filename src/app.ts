import path from 'path'
import express, { Request, Response } from 'express'
import { router } from './api/routes'
import { uiRouter } from './ui/router'
import { errorHandler } from './api/middleware/errorHandler'
import { operatorRouter } from './operator/ui'

export const app = express()
app.use(express.json())
app.use('/api/v1', router)
app.use('/', uiRouter)

// Serve screenshots and other evidence files statically
app.use('/evidence', express.static(path.join(process.cwd(), 'evidence')))

// Operator UI
app.use('/operator', operatorRouter)

// 404 for any route not matched above
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `${req.method} ${req.path} not found` })
})

// Global error handler — must be registered last
app.use(errorHandler)
