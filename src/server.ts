import 'dotenv/config'
import express from 'express'
import { initDb } from './db/client'
import { router } from './api/routes'

const app = express()
app.use(express.json())
app.use('/api/v1', router)

const PORT = process.env.PORT ?? 3000

initDb()

app.listen(PORT, () => {
  console.log(`[browsemind] server running on http://localhost:${PORT}`)
})
