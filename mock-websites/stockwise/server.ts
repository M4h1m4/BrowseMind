/**
 * StockWise — lightweight Express server with SQLite persistence.
 *
 * Mirrors the MediTrack server: serves the static pages and exposes a small REST
 * API so that a saved product actually persists and shows up in the product list,
 * rather than only un-hiding a banner in the browser.
 *
 * Products are seeded once from the site's own data.js, so the catalogue the
 * pages already display is the catalogue the database holds.
 */

import express from 'express'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'
import http from 'http'

const STOCKWISE_DIR = path.resolve(__dirname, '../../mock-websites/stockwise')

let db: Database.Database

export interface ProductRow {
  id:           string
  sku:          string
  name:         string
  category:     string
  description:  string
  unitPrice:    number
  stockLevel:   number
  reorderPoint: number
  supplierId:   string
  unit:         string
}

function initStockWiseDb(dbPath: string): void {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id           TEXT PRIMARY KEY,
      sku          TEXT NOT NULL,
      name         TEXT NOT NULL,
      category     TEXT,
      description  TEXT,
      unitPrice    REAL    DEFAULT 0,
      stockLevel   INTEGER DEFAULT 0,
      reorderPoint INTEGER DEFAULT 0,
      supplierId   TEXT,
      unit         TEXT,
      createdAt    TEXT DEFAULT (datetime('now'))
    )
  `)

  const count = db.prepare('SELECT COUNT(*) as cnt FROM products').get() as { cnt: number }
  if (count.cnt === 0) seedFromDataJs()
}

/**
 * Seed from the site's data.js rather than a second hardcoded copy of the
 * catalogue — one source of truth, and it stays correct if data.js changes.
 */
function seedFromDataJs(): void {
  const dataPath = path.join(STOCKWISE_DIR, 'data.js')
  let products: ProductRow[] = []

  try {
    const source = fs.readFileSync(dataPath, 'utf-8')
    // data.js declares `const STOCKWISE = { ... }` for the browser; evaluate it
    // here and read the products array back out.
    const evaluate = new Function(`${source}; return typeof STOCKWISE !== 'undefined' ? STOCKWISE : null`)
    const store = evaluate() as { products?: ProductRow[] } | null
    products = store?.products ?? []
  } catch (err) {
    console.warn('[stockwise] could not seed from data.js:', (err as Error).message)
    return
  }

  if (products.length === 0) return

  const insert = db.prepare(`
    INSERT OR IGNORE INTO products
      (id, sku, name, category, description, unitPrice, stockLevel, reorderPoint, supplierId, unit)
    VALUES
      (@id, @sku, @name, @category, @description, @unitPrice, @stockLevel, @reorderPoint, @supplierId, @unit)
  `)

  const tx = db.transaction(() => {
    for (const p of products) {
      insert.run({
        id:           p.id,
        sku:          p.sku ?? '',
        name:         p.name ?? '',
        category:     p.category ?? '',
        description:  p.description ?? '',
        unitPrice:    Number(p.unitPrice ?? 0),
        stockLevel:   Number(p.stockLevel ?? 0),
        reorderPoint: Number(p.reorderPoint ?? 0),
        supplierId:   p.supplierId ?? '',
        unit:         p.unit ?? ''
      })
    }
  })
  tx()

  console.log(`[stockwise] seeded ${products.length} products from data.js`)
}

function nextProductId(): string {
  const row = db.prepare(
    "SELECT id FROM products ORDER BY CAST(SUBSTR(id, 4) AS INTEGER) DESC LIMIT 1"
  ).get() as { id: string } | undefined
  if (!row) return 'PRD001'
  const num = parseInt(row.id.substring(3), 10) + 1
  return 'PRD' + String(num).padStart(3, '0')
}

export function createStockWiseServer(dbPath?: string): {
  app: express.Express
  start: (port?: number) => Promise<{ server: http.Server; origin: string }>
} {
  const stockApp = express()
  stockApp.use(express.json())
  stockApp.use(express.urlencoded({ extended: true }))

  initStockWiseDb(dbPath ?? path.resolve(process.cwd(), 'stockwise.db'))

  // ── API routes ──────────────────────────────────────────────────────────

  // GET /api/products — the full catalogue, newest ids last
  stockApp.get('/api/products', (_req, res) => {
    const rows = db.prepare(
      'SELECT * FROM products ORDER BY CAST(SUBSTR(id, 4) AS INTEGER)'
    ).all()
    res.json(rows)
  })

  // GET /api/products/:id
  stockApp.get('/api/products/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)
    if (!row) { res.status(404).json({ error: 'Product not found' }); return }
    res.json(row)
  })

  // POST /api/products — save a new product
  stockApp.post('/api/products', (req, res) => {
    const {
      name, sku, category, description,
      unitPrice, stockLevel, reorderPoint, supplierId, unit
    } = req.body

    if (!name || !sku) {
      res.status(400).json({ error: 'name and sku are required' })
      return
    }

    const duplicate = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku) as { id: string } | undefined
    if (duplicate) {
      res.status(409).json({ error: `SKU ${sku} already exists on ${duplicate.id}` })
      return
    }

    const id = nextProductId()
    db.prepare(`
      INSERT INTO products
        (id, sku, name, category, description, unitPrice, stockLevel, reorderPoint, supplierId, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, sku, name, category ?? '', description ?? '',
      Number(unitPrice ?? 0), Number(stockLevel ?? 0), Number(reorderPoint ?? 0),
      supplierId ?? '', unit ?? ''
    )

    res.status(201).json({ id, message: `Product ${name} saved successfully` })
  })

  // GET /api/stats — catalogue size, the next id, and low-stock count
  stockApp.get('/api/stats', (_req, res) => {
    const productCount = (db.prepare('SELECT COUNT(*) as cnt FROM products').get() as any).cnt
    const lowStock = (db.prepare(
      'SELECT COUNT(*) as cnt FROM products WHERE stockLevel <= reorderPoint'
    ).get() as any).cnt
    res.json({ productCount, nextProductId: nextProductId(), lowStock })
  })

  // ── Static files ────────────────────────────────────────────────────────
  stockApp.use(express.static(STOCKWISE_DIR))

  return {
    app: stockApp,
    start: (port?: number) => {
      return new Promise((resolve, reject) => {
        const server = stockApp.listen(port ?? 0, '0.0.0.0', () => {
          const addr = server.address() as { port: number }
          const origin = `http://0.0.0.0:${addr.port}`
          console.log(`[stockwise] server running on ${origin}`)
          resolve({ server, origin })
        })
        server.on('error', reject)
      })
    }
  }
}

export function closeStockWiseDb(): void {
  if (db) db.close()
}

// Start the server when run directly (not imported as a module)
if (require.main === module) {
  const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'stockwise.db')
  const { start } = createStockWiseServer(dbPath)
  start(4301).catch(err => {
    console.error('[stockwise] failed to start:', err)
    process.exit(1)
  })
}
