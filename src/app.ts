import express from 'express'
import { router } from './api/routes'

export const app = express()
app.use(express.json())
app.use('/api/v1', router)
