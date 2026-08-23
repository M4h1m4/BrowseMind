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

## Quick Start

Everything runs in Docker — the agent, and two self-contained mock web apps it
automates. No Node install, no Playwright download, no live third-party services.

**Prerequisites:** Docker Desktop, and an OpenAI API key.

```bash
git clone https://github.com/M4h1m4/BrowseMind.git
cd BrowseMind
cp .env.example .env          # then edit .env → OPENAI_API_KEY=sk-your-key
docker compose pull
docker compose up -d
```

Give it about twenty seconds, then check all three are healthy:

```bash
docker compose ps
# browsemind   Up (healthy)
# meditrack    Up (healthy)
# stockwise    Up (healthy)
```

### Open these two tabs

**1. The UI — where you start runs and take over when asked:**

```
http://localhost:3000
```

**2. The live browser — where you WATCH the run happen:**

```
http://localhost:6080/vnc.html?resize=scale
```

Open the second one **before** you start a run. The agent drives a real browser
inside the container, and this is the only place you can see it. Without it a
run looks like a progress bar; with it you watch every click, scroll and
keystroke as it happens — and it is the window you type into when a run pauses
and asks for help.

The `?resize=scale` matters: without it the remote screen is cropped to your
window instead of scaled to fit.

The two mock sites it automates, if you want to inspect them directly:

| | URL |
|---|---|
| MediTrack (mock EHR) | `http://localhost:4300` |
| StockWise (mock inventory) | `http://localhost:4301` |

`OPENAI_API_KEY` is the only value you must set. Everything else in
`.env.example` has a working default.

### Why the browser is visible

Capture and replay run Chromium with `headless: false` on purpose. Human escalation
means an operator takes control of the *live* session — fixing a rejected field,
dismissing a dialog — which needs a real browser to act in. In the container that
browser renders to a virtual display, streamed to the noVNC URL above.

Stop everything with `docker compose down`, or `docker compose down -v` to also
discard the mock sites' data.

---

## Demo Path

### Via the UI

1. Open `http://localhost:3000`, and `http://localhost:6080/vnc.html?resize=scale`
   in a second tab to watch.
2. **Target App:** `http://localhost:4300`
3. **Goal** — read-only extraction, a good opener since nothing is written:
   ```
   On the dashboard, go to the recent patients table. For every patient in the
   recent patients table, click on the view button and extract their names and
   active conditions and print to the UI.
   ```
4. Click **Start Capture**. The browser opens in the noVNC tab and drives itself.
   Five patients and their conditions are printed back into the UI.
5. The run prints an **artifact ID**. Paste it into the replay box and click
   **Replay** to re-run the same workflow deterministically, no LLM involved.

#### Writing data, and a human handoff

Two records in one goal. Capture registers the first; a chained replay registers
the second. The second SSN is deliberately two digits, so MediTrack rejects the
submission and the run **pauses for you**:

```
Go to the patients tab, click the add new patient button and add these patients and click Register Patient button to submit.

1) First Name: "William", Last Name: "Carter", Date of Birth: "1983-06-14", Gender: "Male", SSN (last 4): "4821", Phone Number: "(617) 555-3201", Home Address: "45 Beacon Street, Boston, MA 02108", Emergency Contact Name: "Sarah Carter", Emergency Contact Phone: "(617) 555-3202", Insurance Provider: "Cigna".

2) First Name: "Elena", Last Name: "Vasquez", Date of Birth: "1975-11-28", Gender: "Female", SSN (last 4): "79", Phone Number: "(312) 555-8470", Home Address: "220 Michigan Avenue, Chicago, IL 60601", Emergency Contact Name: "Marco Vasquez", Emergency Contact Phone: "(312) 555-8471", Insurance Provider: "BlueCross BlueShield".
```

Keep the line breaks — `1)` and `2)` must each start a line.

When it reports **Stuck at step 13**, correct the SSN to `7934` in the noVNC tab
and click **I'm Done — Resume** in the UI. Do not press Register yourself; the
retry does that. The run resumes and completes.

### Via the API

Capture — returns a `runId`:

```bash
curl -s -X POST http://localhost:3000/api/v1/capture/run \
  -H 'Content-Type: application/json' \
  -d '{
    "goal": "Go to the patients tab and click on add patient. Fill in First Name and Last Name: \"Test User\", Date of Birth: \"1990-01-01\", Gender: \"Male\", Blood Type: \"O+\". Then click register patient to save the record.",
    "targetApp": "http://localhost:4300"
  }'
```

Poll until `status` is `success`, and read the `artifactId` off the response:

```bash
curl -s http://localhost:3000/api/v1/runs/<runId>/status
```

Replay that artifact:

```bash
curl -s -X POST http://localhost:3000/api/v1/replay/run \
  -H 'Content-Type: application/json' \
  -d '{"artifactId": "<artifactId>"}'
```

Poll the replay the same way. Artifacts and run logs land in `evidence/`.

---

## Tests

```bash
npm run test:ci                  # unit + integration, no browser required
RUN_E2E=true npm run test:e2e    # full end-to-end with a real browser
```

`test:ci` needs neither the mock sites nor an OpenAI key. `test:e2e` needs both.

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

## Local Development (without Docker)

Docker is the supported path above. To run against the source directly:

```bash
npm install
npx playwright install chromium
cp .env.example .env          # set OPENAI_API_KEY
```

Two terminals, both must stay running:

```bash
npm run mocks                 # terminal 1 — MediTrack :4300, StockWise :4301
npm run dev                   # terminal 2 — BrowseMind :3000
```

Target App is `http://127.0.0.1:4300`. The browser opens on your desktop, so
there is no noVNC step. If `npm run mocks` is not up, runs fail at step 0 with
`net::ERR_CONNECTION_REFUSED`.

---

## Tech Stack

- **Runtime** — Node.js, TypeScript, Express
- **Browser automation** — Playwright (Chromium)
- **LLM** — OpenAI GPT-4o-mini via function calling
- **Database** — SQLite via better-sqlite3
- **Tests** — Jest, Supertest
- **Containerization** — Docker (multi-stage, ~259MB images) — optional, see above

---

## License

MIT