# BrowseMind

A computer-use automation system that records LLM-driven browser sessions as reusable, deterministic capabilities and replays them against legacy web applications.

## What It Does

BrowseMind bridges the gap between AI agents and legacy web applications that lack APIs. It operates in two phases:

**Capture (Discovery)** — Given a natural-language goal and a target URL, BrowseMind launches a real browser, observes the UI, and uses an LLM (GPT-4o-mini) to decide the next action (click, input, navigate, scroll, wait). Each action is executed, the resulting DOM state is captured, and stable element selectors (aria-label, placeholder, text content, coordinates as fallback) are extracted. The full session is saved as a typed, versioned **artifact** in SQLite — a reusable capability the agent can invoke on demand.

**Replay (Production)** — The saved artifact is replayed deterministically without the LLM in the loop. Each step locates elements via ranked selector strategies (semantic → CSS → coordinates), executes the action, and verifies a checkpoint condition (element visible, URL contains, text present) before proceeding. This makes replay fast, cheap, and reliable — no LLM costs or variability in production.

## Key Capabilities

- **Multi-sample goals** — Capture once with one data record; replay automatically chains across multiple data records (e.g., "Add patient A, then B, then C")
- **Human escalation** — When stuck (element not found, checkpoint failed) or on destructive actions (delete/remove), BrowseMind pauses, shows the live browser to a human operator, and resumes after manual intervention
- **Destructive action guardrails** — Automatic detection of delete/remove/destroy actions; requires explicit human confirmation before execution
- **Safety guardrails** — Domain allowlist, action classification (read/write/destructive), PII redaction in logs and artifacts
- **Multi-tenant isolation** — Artifacts scoped by tenant; schema supports cross-tenant artifact inheritance (base artifact + overrides)

---

## Quick Start (Docker - Recommended)

```bash
# 1. Clone
git clone https://github.com/M4h1m4/BrowseMind.git
cd BrowseMind

# 2. Add OpenAI key
cp .env.example .env
# Edit .env → OPENAI_API_KEY=sk-your-key

# 3. Pull & run (uses pre-built images from Docker Hub)
docker compose pull
docker compose up -d

# 4. Open UI
open http://localhost:3000
```

**Services started:**
- BrowseMind UI: `http://localhost:3000`
- MediTrack (mock): `http://localhost:4300`
- StockWise (mock): `http://localhost:4301`

---

## Manual Capture Test

1. Open `http://localhost:3000`
2. Paste goal (example for MediTrack):
   ```
   Go to the patients tab and click on add patient. Fill in the following details:
   First Name and Last Name: "Test User", Date of Birth: "1990-01-01", Gender: "Male",
   Blood Type: "O+", SSN last 4 digits: "1234", Phone Number: "(555) 123-4567",
   Email Address: "test@email.com", Home Address: "123 Main St, Boston, MA",
   Emergency Contact Name and Phone: "Contact (555) 987-6543",
   Active Conditions / Diagnoses: "None", Known Allergies: "None",
   Insurance Provider: "Test Insurance".
   After entering all the details, click on register patient to save the record.
   If the registration is successful, you should see a success notification on the page.
   If any error or validation message appears instead, address it accordingly.
   ```
3. Target App: `http://127.0.0.1:4300`
4. Click **Start Capture** → watch artifact creation

---

## Local Development (Without Docker)

```bash
git clone https://github.com/M4h1m4/BrowseMind.git
cd BrowseMind
npm install
npx playwright install chromium
cp .env.example .env  # Add OPENAI_API_KEY
npm run dev           # Server on http://localhost:3000
```

**Run tests:**
```bash
npm run test:ci       # Unit + integration (no browser)
RUN_E2E=true npm run test:e2e  # Full e2e with real browser
```

---

## Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/capture/run` | Start capture run |
| `POST` | `/api/v1/replay/run` | Start replay from artifact |
| `GET`  | `/api/v1/runs/:id/status` | Poll run status |
| `POST` | `/api/v1/runs/:id/resume` | Resume after human handoff |

---

## Artifacts & Evidence

- Artifacts: `evidence/artifacts/<artifactId>.json`
- Run logs: `evidence/runs/<runId>.json`
- Screenshots: `evidence/screenshots/`

---

## Tech Stack

- **Runtime** — Node.js, TypeScript, Express
- **Browser automation** — Playwright (Chromium)
- **LLM** — OpenAI GPT-4o-mini via function calling
- **Database** — SQLite via better-sqlite3
- **Tests** — Jest, Supertest
- **Containerization** — Docker (multi-stage, ~259MB images)

---

## License

MIT