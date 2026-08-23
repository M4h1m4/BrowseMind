/**
 * MediTrack — lightweight Express server with SQLite persistence.
 *
 * Serves the static HTML pages and exposes a small REST API so that
 * patient registrations actually persist and appear in the patient list.
 */

import express from 'express'
import path from 'path'
import Database from 'better-sqlite3'
import http from 'http'

const MEDITRACK_DIR = path.resolve(__dirname, '../../mock-websites/meditrack')

/**
 * Interface to bind the listener to.
 *
 * Defaults to loopback so a mock EHR on a laptop is not reachable from the rest
 * of the network. Containers set BIND_HOST=0.0.0.0, because a listener bound to
 * the container's loopback cannot be reached from outside it.
 */
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1'

/**
 * An address a client can actually connect to.
 *
 * 0.0.0.0 and :: mean "every interface" to bind(); they are not destinations, so
 * they must never be handed back as an origin. Callers use this string as the
 * targetApp, and it gets recorded into artifacts.
 */
function connectableOrigin(host: string, port: number): string {
  const reachable = host === '0.0.0.0' || host === '::' || host === '' ? '127.0.0.1' : host
  return `http://${reachable}:${port}`
}

let db: Database.Database

function initMediTrackDb(dbPath: string): void {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id          TEXT PRIMARY KEY,
      firstName   TEXT NOT NULL,
      lastName    TEXT NOT NULL,
      dob         TEXT,
      gender      TEXT,
      bloodType   TEXT,
      ssn         TEXT,
      phone       TEXT,
      email       TEXT,
      address     TEXT,
      conditions  TEXT,
      allergies   TEXT,
      insurance   TEXT,
      emergencyContact TEXT,
      createdAt   TEXT DEFAULT (datetime('now'))
    )
  `)

  // Seed with the 15 original patients if table is empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM patients').get() as { cnt: number }
  if (count.cnt === 0) {
    seedPatients()
  }
}

function seedPatients(): void {
  const patients = [
    { id: 'P001', firstName: 'Margaret', lastName: 'Thornton', dob: '1958-03-12', gender: 'Female', bloodType: 'A+', phone: '(617) 555-0143', email: 'margaret.thornton@email.com', address: '14 Birchwood Drive, Boston, MA 02108', conditions: 'Hypertension, Type 2 Diabetes', allergies: 'Penicillin, Sulfa drugs', insurance: 'BlueCross BlueShield', emergencyContact: 'Robert Thornton (617) 555-0144' },
    { id: 'P002', firstName: 'James', lastName: 'Calloway', dob: '1972-07-24', gender: 'Male', bloodType: 'O+', phone: '(617) 555-0287', email: 'jcalloway72@webmail.com', address: '88 Maple Street, Cambridge, MA 02139', conditions: 'Asthma, Seasonal Allergies', allergies: 'Aspirin, Latex', insurance: 'Aetna', emergencyContact: 'Linda Calloway (617) 555-0288' },
    { id: 'P003', firstName: 'Dorothy', lastName: 'Nakamura', dob: '1965-11-03', gender: 'Female', bloodType: 'B+', phone: '(781) 555-0311', email: 'd.nakamura@mailbox.net', address: '220 Oak Avenue, Somerville, MA 02143', conditions: 'Rheumatoid Arthritis, Osteoporosis', allergies: 'Codeine', insurance: 'United Healthcare', emergencyContact: 'Tom Nakamura (781) 555-0312' },
    { id: 'P004', firstName: 'Samuel', lastName: 'Okafor', dob: '1989-04-17', gender: 'Male', bloodType: 'A-', phone: '(617) 555-0419', email: 'samuel.okafor@techmail.io', address: '5 Fenway Circle, Boston, MA 02115', conditions: 'Hyperlipidemia', allergies: 'None known', insurance: 'Cigna', emergencyContact: 'Adaeze Okafor (617) 555-0420' },
    { id: 'P005', firstName: 'Helen', lastName: 'Vasquez', dob: '1943-09-28', gender: 'Female', bloodType: 'AB+', phone: '(508) 555-0512', email: 'helen.vasquez@seniornet.org', address: '301 Elm Street, Worcester, MA 01601', conditions: 'Congestive Heart Failure, Atrial Fibrillation, Type 2 Diabetes', allergies: 'Ibuprofen, Contrast dye', insurance: 'Medicare', emergencyContact: 'Carlos Vasquez (508) 555-0513' },
    { id: 'P006', firstName: 'Richard', lastName: 'Petrov', dob: '1981-01-30', gender: 'Male', bloodType: 'B-', phone: '(617) 555-0634', email: 'r.petrov@corporate.com', address: '77 Congress Street, Boston, MA 02109', conditions: 'Anxiety Disorder, Insomnia', allergies: 'None known', insurance: 'Harvard Pilgrim', emergencyContact: 'Anna Petrov (617) 555-0635' },
    { id: 'P007', firstName: 'Patricia', lastName: 'O\'Brien', dob: '1956-08-09', gender: 'Female', bloodType: 'O-', phone: '(781) 555-0721', email: 'pobrien56@inbox.com', address: '18 Harbor Lane, Quincy, MA 02169', conditions: 'COPD, Osteoarthritis', allergies: 'Morphine', insurance: 'Tufts Health Plan', emergencyContact: 'Michael O\'Brien (781) 555-0722' },
    { id: 'P008', firstName: 'David', lastName: 'Chen', dob: '1995-12-01', gender: 'Male', bloodType: 'A+', phone: '(617) 555-0845', email: 'david.chen95@protonmail.com', address: '44 Beacon Hill Place, Boston, MA 02114', conditions: 'None', allergies: 'None known', insurance: 'Cigna', emergencyContact: 'Li Chen (617) 555-0846' },
    { id: 'P009', firstName: 'Gloria', lastName: 'Washington', dob: '1970-05-22', gender: 'Female', bloodType: 'AB-', phone: '(508) 555-0937', email: 'gwashington@healthmail.org', address: '160 Main Street, Springfield, MA 01103', conditions: 'Lupus, Chronic Kidney Disease', allergies: 'Sulfonamides, NSAIDs', insurance: 'MassHealth', emergencyContact: 'Derek Washington (508) 555-0938' },
    { id: 'P010', firstName: 'Thomas', lastName: 'Johansson', dob: '1988-03-15', gender: 'Male', bloodType: 'O+', phone: '(617) 555-1042', email: 't.johansson@email.com', address: '92 Commonwealth Ave, Boston, MA 02116', conditions: 'Type 1 Diabetes', allergies: 'None known', insurance: 'BlueCross BlueShield', emergencyContact: 'Erik Johansson (617) 555-1043' },
    { id: 'P011', firstName: 'Maria', lastName: 'Santos', dob: '1962-10-07', gender: 'Female', bloodType: 'A+', phone: '(781) 555-1155', email: 'msantos@familynet.com', address: '200 Pleasant Street, Malden, MA 02148', conditions: 'Hypothyroidism, Depression', allergies: 'Erythromycin', insurance: 'United Healthcare', emergencyContact: 'Jorge Santos (781) 555-1156' },
    { id: 'P012', firstName: 'William', lastName: 'Foster', dob: '1975-06-19', gender: 'Male', bloodType: 'B+', phone: '(617) 555-1268', email: 'wfoster75@outlook.com', address: '33 Summer Street, Brookline, MA 02445', conditions: 'Gout, Hypertension', allergies: 'Allopurinol', insurance: 'Aetna', emergencyContact: 'Susan Foster (617) 555-1269' },
    { id: 'P013', firstName: 'Linda', lastName: 'Park', dob: '1990-02-14', gender: 'Female', bloodType: 'O+', phone: '(617) 555-1371', email: 'linda.park@startup.io', address: '8 Newbury Street, Boston, MA 02116', conditions: 'Migraine', allergies: 'Triptans', insurance: 'Harvard Pilgrim', emergencyContact: 'James Park (617) 555-1372' },
    { id: 'P014', firstName: 'Robert', lastName: 'Kowalski', dob: '1953-04-03', gender: 'Male', bloodType: 'A-', phone: '(508) 555-1484', email: 'rkowalski@veteranmail.org', address: '55 Veterans Road, Framingham, MA 01701', conditions: 'Parkinson\'s Disease, Benign Prostatic Hyperplasia', allergies: 'Metoclopramide', insurance: 'Tricare', emergencyContact: 'Eva Kowalski (508) 555-1485' },
    { id: 'P015', firstName: 'Angela', lastName: 'Rivera', dob: '1984-11-25', gender: 'Female', bloodType: 'B-', phone: '(617) 555-1597', email: 'a.rivera@designstudio.com', address: '120 Tremont Street, Boston, MA 02108', conditions: 'Endometriosis, Iron-deficiency Anemia', allergies: 'Latex', insurance: 'Cigna', emergencyContact: 'Marco Rivera (617) 555-1598' },
  ]

  const insert = db.prepare(`
    INSERT INTO patients (id, firstName, lastName, dob, gender, bloodType, phone, email, address, conditions, allergies, insurance, emergencyContact)
    VALUES (@id, @firstName, @lastName, @dob, @gender, @bloodType, @phone, @email, @address, @conditions, @allergies, @insurance, @emergencyContact)
  `)

  const tx = db.transaction(() => {
    for (const p of patients) insert.run(p)
  })
  tx()
}

function nextPatientId(): string {
  const row = db.prepare("SELECT id FROM patients ORDER BY CAST(SUBSTR(id, 2) AS INTEGER) DESC LIMIT 1").get() as { id: string } | undefined
  if (!row) return 'P001'
  const num = parseInt(row.id.substring(1), 10) + 1
  return 'P' + String(num).padStart(3, '0')
}

export function createMediTrackServer(dbPath?: string): { app: express.Express; start: (port?: number) => Promise<{ server: http.Server; origin: string }> } {
  const mediApp = express()
  mediApp.use(express.json())
  mediApp.use(express.urlencoded({ extended: true }))

  // Initialize DB
  initMediTrackDb(dbPath ?? path.resolve(process.cwd(), 'meditrack.db'))

  // ── API routes ──────────────────────────────────────────────────────────

  // GET /api/patients — list all patients
  mediApp.get('/api/patients', (_req, res) => {
    const rows = db.prepare('SELECT * FROM patients ORDER BY CAST(SUBSTR(id, 2) AS INTEGER)').all()
    const patients = (rows as any[]).map(r => ({
      ...r,
      name: `${r.firstName} ${r.lastName}`,
      conditions: r.conditions ? r.conditions.split(', ') : [],
      allergies: r.allergies ? r.allergies.split(', ') : []
    }))
    res.json(patients)
  })

  // POST /api/patients — register a new patient
  mediApp.post('/api/patients', (req, res) => {
    const { firstName, lastName, dob, gender, bloodType, ssn, phone, email, address, conditions, allergies, insurance, emergencyContact } = req.body
    if (!firstName || !lastName) {
      res.status(400).json({ error: 'firstName and lastName are required' })
      return
    }

    const id = nextPatientId()
    db.prepare(`
      INSERT INTO patients (id, firstName, lastName, dob, gender, bloodType, ssn, phone, email, address, conditions, allergies, insurance, emergencyContact)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, firstName, lastName, dob ?? '', gender ?? '', bloodType ?? '', ssn ?? '', phone ?? '', email ?? '', address ?? '', conditions ?? '', allergies ?? '', insurance ?? '', emergencyContact ?? '')

    res.status(201).json({ id, message: `Patient ${firstName} ${lastName} registered successfully` })
  })

  // GET /api/patients/:id — get a single patient
  mediApp.get('/api/patients/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id) as any
    if (!row) { res.status(404).json({ error: 'Patient not found' }); return }
    res.json({ ...row, name: `${row.firstName} ${row.lastName}`, conditions: row.conditions ? row.conditions.split(', ') : [], allergies: row.allergies ? row.allergies.split(', ') : [] })
  })

  // DELETE /api/patients/:id — delete a patient (destructive)
  mediApp.delete('/api/patients/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id) as any
    if (!row) { res.status(404).json({ error: 'Patient not found' }); return }
    
    db.prepare('DELETE FROM patients WHERE id = ?').run(req.params.id)
    res.json({ message: `Patient ${row.firstName} ${row.lastName} (${req.params.id}) deleted successfully` })
  })

  // GET /api/stats — registry size and the ID the next registration will get.
  // The form reads this so its sidebar reflects the real database instead of a
  // number baked into the markup.
  mediApp.get('/api/stats', (_req, res) => {
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM patients').get() as any).cnt
    res.json({ patientCount: count, nextPatientId: nextPatientId() })
  })

  // ── Serve static files (HTML, CSS, JS) ──────────────────────────────────
  mediApp.use(express.static(MEDITRACK_DIR))

  return {
    app: mediApp,
    start: (port?: number) => {
      return new Promise((resolve, reject) => {
        const server = mediApp.listen(port ?? 0, BIND_HOST, () => {
          const addr = server.address() as { port: number }
          const origin = connectableOrigin(BIND_HOST, addr.port)
          console.log(`[meditrack] server running on ${origin}`)
          resolve({ server, origin })
        })
        server.on('error', reject)
      })
    }
  }
}

export function closeMediTrackDb(): void {
  if (db) db.close()
}

// Start the server when run directly (not imported as a module)
if (require.main === module) {
  const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'meditrack.db')
  const { start } = createMediTrackServer(dbPath)
  start(4300).catch(err => {
    console.error('[meditrack] failed to start:', err)
    process.exit(1)
  })
}
