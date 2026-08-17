# Product Requirements Document

| Field | Details |
|---|---|
| Product | Computer-Use Automation System |
| Author | Mahima Mannava |
| Version | 1.0 |
| Status | Draft |
| Date | 2026-08-13 |

---

## 1. Problem Statement

Banks and credit unions operate hundreds of legacy back-office applications that expose no API. The only way to interact with these systems is to drive the UI the way a human operator would. Automating this manually is not scalable — every new task requires a developer to hand-write brittle selectors that break when the UI changes.

This system solves that by letting an LLM figure out how to accomplish a task the first time, then turning what it learned into a deterministic, replayable capability that AI agents can invoke on demand — without re-reasoning about the UI every time.

---

## 2. Goals

- Enable AI agents to operate legacy web applications that have no API
- Record a successful LLM-driven run as a structured, reusable capability artifact
- Replay that artifact deterministically in production without LLM involvement
- Handle runtime errors, exceptional states, and human escalation gracefully
- Support multi-tenant reuse — one recorded capability shared across institutions running the same app

## 3. Non-Goals

- Automating applications that expose a usable API (API integration is always preferred)
- Desktop application support (Phase 2 — design only, not built)
- Real-time co-browsing operator console
- Multi-tenant infrastructure (schema supports it, infrastructure is not built)
- Bot detection bypass (not required for target application)

---

## 4. Users & Personas

| Persona | Role | Interaction |
|---|---|---|
| Human | Records capabilities, monitors runs, intervenes when stuck, and takes over when automation cannot proceed | Triggers discovery via natural language goal, operates live browser during escalation, signals resume via operator UI |
| AI Agent | Invokes saved capabilities in production | Calls replay API with typed input parameters, receives typed outputs |

---

## 5. Functional Requirements

### 5.1 Discovery
- Accept a natural language goal and target application as input
- Run an LLM-driven observe → decide → act loop against a live browser until goal is met or stopping condition is hit
- At each step, extract stable element signals from the acted-on element alongside the screenshot-based action
- On successful completion, save a structured, versioned artifact to the database

### 5.2 Artifact
- Must capture: ordered steps, ranked element targeting strategies per step, typed input parameters, typed output parameters, checkpoints, known business outcomes, and recoverable conditions
- Must be tenant-scoped with optional inheritance from a base artifact
- Must be versioned, human-readable, and machine-invocable
- Must never contain credentials, tokens, or raw PII

### 5.3 Deterministic Replay
- Accept an artifact ID and typed input parameters
- Re-execute the recorded flow without invoking the LLM for any decision
- Locate elements using stored targeting strategies in priority order
- Verify checkpoints at each step
- Classify and handle all failure modes explicitly:
  - **Business outcome** — legitimate result the caller needs (e.g. "employee not found")
  - **Recoverable condition** — known interstitial the system handles automatically (e.g. session timeout dialog)
  - **Hard failure** — unrecoverable error, stop and return structured error with step, expected state, observed state
- Return typed outputs to caller on success

### 5.4 Human-in-the-Loop Escalation
- Detect when automation cannot safely proceed and pause the run
- On stuck: pause automation, emit intervention request containing goal, current step, reason, and screenshot
- Expose the same live browser session for human control — do not open a new session
- On human signal (I'm finished): preserve session state and resume automation
- Record human intervention in run log: before/after screenshot, natural language notes, timestamp

### 5.5 Operator UI
- Display intervention request with full context
- Accept natural language input from human operator
- Provide "Take over" and "I'm finished" controls
- Trigger resume via API on completion

### 5.6 Safety Guardrails
- Enforce per-artifact domain allowlist — block navigation outside permitted domains
- Classify actions as read-only, write, or destructive — flag or block destructive actions
- Never persist credentials or PII in artifacts, logs, or database
- Inject credentials at runtime via environment variables only

### 5.7 Observability
- Structured run log per execution: step, action taken, element found, checkpoint result, status, timestamps
- Screenshot captured on failure or stuck state
- Clear separation between discovery run evidence and replay run evidence

---

## 6. Non-Functional Requirements

| Requirement | Description |
|---|---|
| Determinism | Replay must produce the same result given the same artifact and inputs on a stable UI |
| Recoverability | Replay must resume correctly after human handoff with no loss of session state |
| Auditability | Every run must produce a structured log sufficient to debug any failure |
| Security | No secrets in artifacts, logs, or version control. Credentials via environment variables only |
| Extensibility | Artifact schema and replay engine must support desktop surfaces in Phase 2 without schema changes |
| Tenant isolation | Artifacts are scoped to tenants. Base artifacts can be inherited but not mutated by tenant overrides |

---

## 7. Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Runtime | Node.js |
| Browser automation | Playwright |
| LLM | Claude API (Anthropic) — discovery only |
| Database | SQLite via better-sqlite3 |
| API framework | Express.js |
| Operator UI | Minimal HTML/JS web page |

---

## 8. API Surface

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/v1/discovery/run | Start a discovery run with a natural language goal |
| POST | /api/v1/replay/run | Trigger deterministic replay with typed inputs |
| GET | /api/v1/runs/:runId/status | Poll current run status and intervention request |
| POST | /api/v1/runs/:runId/resume | Signal human handoff complete, resume automation |
| GET | /api/v1/artifacts | List artifacts filtered by tenantId |
| GET | /api/v1/artifacts/:artifactId | Retrieve a specific artifact |
| DELETE | /api/v1/artifacts/:artifactId | Delete an artifact |

---

## 9. Success Criteria

| Criteria | Acceptance Condition |
|---|---|
| Discovery | LLM completes a real goal against OrangeHRM. Artifact saved with all steps, elementData, checkpoints, input/output schema |
| Replay | Artifact re-runs without LLM. Elements located via stored attributes. Typed outputs returned to caller |
| Error handling | At least one business outcome and one hard failure correctly classified and returned |
| Escalation | Stuck detected, intervention request shown, human takes over live browser, automation resumes with preserved session |
| Safety | Domain allowlist enforced. Zero credentials or PII in artifact, logs, or database |
| Observability | Every run produces a structured log. Failure produces a screenshot |

---

## 10. Out of Scope & Future Work

| Item | Status |
|---|---|
| Desktop application support | Phase 2 — seam designed, not built |
| Multi-tenant infrastructure (queues, routing) | Future — schema supports it, infrastructure deferred |
| Bot detection bypass (CUA OS-level events) | Future — not required for OrangeHRM |
| Artifact confidence scoring & approval workflow | Future stretch goal |
