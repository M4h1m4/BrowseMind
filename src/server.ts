import 'dotenv/config'
import { app } from './app'
import { initDb } from './db/client'

const PORT = process.env.PORT ?? 3000

initDb()

app.listen(PORT, () => {
  console.log(`[browsemind] server running on http://localhost:${PORT}`)
})
