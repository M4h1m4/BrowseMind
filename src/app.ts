import express, { Request, Response } from 'express'
import { router } from './api/routes'
import { errorHandler } from './api/middleware/errorHandler'

export const app = express()
app.use(express.json())
app.use('/api/v1', router)

// 404 for any route not matched above
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `${req.method} ${req.path} not found` })
})

// Global error handler — must be registered last
app.use(errorHandler)
