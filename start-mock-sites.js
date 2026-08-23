require('ts-node/register')
const { createMediTrackServer } = require('./mock-websites/meditrack/server')
const { createStockWiseServer } = require('./mock-websites/stockwise/server')
const path = require('path')

async function main() {
  const meditrack = createMediTrackServer(path.resolve(__dirname, 'meditrack.db'))
  await meditrack.start(4300)
  const stockwise = createStockWiseServer(path.resolve(__dirname, 'stockwise.db'))
  await stockwise.start(4301)
  console.log('[mock-sites] mediTrack: http://127.0.0.1:4300 | stockwise: http://127.0.0.1:4301')
}
main().catch(e => { console.error(e); process.exit(1) })
