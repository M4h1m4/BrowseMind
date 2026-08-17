# Engineering Document — Computer-Use Automation System

---

## 1. Architecture Overview

The system has two main phases: **Capture** and **Replay**. A visible Chromium browser runs throughout — during capture, human escalation, and replay.

### Capture Phase (Milestone 1)

1. Human submits a natural language goal via API
2. Discovery Agent opens a live Chromium browser
3. Agent takes a screenshot and sends it to the LLM with the goal
4. LLM returns a structured action decision via function calling
5. Guardrails check runs (domain allowlist, action classification)
6. Playwright executes the action in the browser — action space: `click | input | navigate | wait | scroll | keydown` (see Section 3.1 for full schema)
7. DOM Extractor captures element attributes from the acted-on element
8. Post-action screenshot taken — LLM observes resulting page state and labels what on the page proves this step succeeded — that label becomes the checkpoint stored in the artifact
9. Step is appended to the artifact builder
10. Loop repeats until goal is complete or max steps reached
11. Artifact saved to SQLite, run log written to `/evidence/runs/`

### Capture Phase Additions (Milestone 2)

- If LLM detects a login page: agent pauses → human logs in manually in live browser → Session Manager saves cookies + localStorage to SQLite → agent resumes
- If a destructive action is detected: agent pauses → human confirms via Operator UI → agent resumes

### Replay Phase (Milestone 1)

1. Caller submits artifact ID and typed inputs via API
2. Replay Engine reads artifact from SQLite
3. For each step: substitute `{{parameters}}` with caller inputs
4. Find element using stored DOM attributes (primary → secondary → tertiary → coordinates fallback)
5. Execute action, verify checkpoint
6. Check knownOutcomes — if matched, return business outcome to caller
7. Check recoverableConditions — if matched, handle automatically and continue
8. If checkpoint fails after all strategies and retries: hard failure, stop
9. Return typed outputs to caller on success

### Replay Phase Additions (Milestone 2)

- Before replay starts: Session Manager restores saved cookies + localStorage per domain — all sites pre-authenticated, no human login needed
- If stuck during replay (checkpoint fails + all strategies exhausted + retryCount >= maxRetries): Operator UI shown → human takes over live browser → signals done → automation resumes
- If session expires mid-replay: classified as recoverable condition → human re-logs in → session re-saved → resume

---

## 2. Component Boundaries

```
Milestone 1:
  src/agent/discovery.ts       — capture loop
  src/agent/replay.ts          — replay engine
  src/agent/extractor.ts       — DOM extraction
  src/artifact/repository.ts   — SQLite read/write
  src/artifact/schema.ts       — type definitions
  src/guardrails/policy.ts     — allowlist, action classification
  src/api/routes.ts            — all API endpoints

Milestone 2 (additions):
  src/agent/session.ts         — credential capture, session save/restore
  src/operator/handoff.ts      — pause/resume, intervention request
  operator-ui/                 — minimal web UI for human handoff
```

---

## 3. Milestone 1 — Capture → Artifact → Replay

### 3.1 Discovery Agent (`src/agent/discovery.ts`)

Runs the LLM-driven capture loop against a live Chromium browser.

**Inputs:** `{ goal: string, targetApp: string, tenantId: string }`
**Outputs:** saved artifact in SQLite, run log in `/evidence/runs/`

**Loop per step:**
1. Take screenshot of current browser state
2. Build context: `updatedSummary` + last 10 steps + current screenshot + goal
3. Send to LLM via function calling
4. Model returns structured action decision
5. Validate action against guardrails policy
6. Execute action via Playwright
7. Run DOM Extractor on acted-on element
8. Take post-action screenshot — include in next LLM call so LLM observes resulting page state and labels the checkpoint for the step just executed
9. Append step to artifact builder (checkpoint populated from LLM label in step 8)
10. Slide context window — drop oldest step, carry forward `updatedSummary`
11. Repeat until `goalComplete` or maxSteps (default 25) hit

**LLM prompt structure:**

System prompt:
```
You are navigating a web application to achieve a goal.
You will receive a summary of earlier steps, the last 10 steps in detail,
and the current screenshot. Use function calling to return your decision.
```

User message per step:
- `updatedSummary` — running summary of steps before the current window
- Last N=10 steps in full
- Current screenshot (base64)
- Goal

Function call schema enforced by API:
```json
{
  "checkpointForPreviousStep": {
    "type":  "url-contains | element-visible | text-present",
    "value": "what on this page proves the previous action succeeded"
  },
  "action":            "click | input | navigate | wait | scroll | keydown",
  "targetDescription": "human description of target element",
  "value":             "value to type if input, null otherwise",
  "reasoning":         "why this action achieves the goal",
  "requiresLogin":     "boolean",
  "goalComplete":      "boolean",
  "updatedSummary":    "compact summary of all steps taken so far"
}
```

`checkpointForPreviousStep` is null on the first step — there is no previous action to verify. From step 2 onwards, the LLM observes the post-action screenshot and declares what it sees as ground truth proof of the prior step's success. This checkpoint is stored in the artifact against the previous step and used during replay for deterministic verification.

Function calling guarantees the response always matches this schema — no parsing edge cases, no malformed responses mid-run.

**Stopping conditions:**
- LLM signals `goalComplete: true`
- Max steps exceeded (default 25, configurable up to 30)
- Guardrail violation (domain outside allowlist)

---

### 3.2 DOM Extractor (`src/agent/extractor.ts`)

Runs after each action during capture. Extracts stable element attributes for artifact storage.

**Inputs:** Playwright `Page` object + clicked element locator
**Outputs:** `ElementData` object

**Extraction priority:**
```
primary:   aria-label
secondary: placeholder
tertiary:  text-content
fallback:  coordinates { x, y }
```

Runs via `page.evaluate()` — JavaScript injected into the browser to read DOM attributes of the acted-on element.

---

### 3.3 Replay Engine (`src/agent/replay.ts`)

Re-executes a saved artifact deterministically. No LLM involved.

**Inputs:** `{ artifactId: string, tenantId: string, inputs: Record<string, any> }`
**Outputs:** `{ status, outputs, error }`

**Per step execution:**
1. Substitute parameter values (`{{employeeName}}` → actual value from inputs)
2. Try primary elementData strategy → if found, act
3. Try secondary → if found, act
4. Try tertiary → if found, act
5. Try fallback (coordinates) → act
6. Verify checkpoint
7. Check `knownOutcomes` → if matched, return business outcome
8. Check `recoverableConditions` → if matched, handle automatically
9. If checkpoint fails: increment `retryCount`, retry up to `maxRetries`
10. If `maxRetries` exceeded: hard failure, stop

**Note (Milestone 1):** No session handling. Test against flows that do not require login, or assume browser is already authenticated.

---

### 3.4 Artifact Repository (`src/artifact/repository.ts`)

SQLite read/write for artifacts.

**Operations:**
- `save(artifact)` — insert or update
- `findById(artifactId, tenantId)` — retrieve single artifact
- `findByTenant(tenantId)` — list all for tenant
- `delete(artifactId)` — remove

---

## 4. Data Models

### Artifact
```typescript
interface Artifact {
  artifactId:    string
  tenantId:      string
  baseArtifactId?: string
  version:       number
  goal:          string
  targetApp:     string
  createdAt:     string
  allowWrites:   boolean
  inputSchema:   Record<string, { type: string }>
  outputSchema:  Record<string, { type: string, sensitive: boolean }>
  steps:         Step[]
}

interface Step {
  stepNumber:           number
  actionType:           'click' | 'input' | 'navigate' | 'wait' | 'scroll' | 'keydown'
  description:          string
  value?:               string         // hardcoded or "{{parameterName}}"
  sensitive:            boolean        // suppress screenshot if true
  elementData:          ElementData
  waitAfter:            number
  maxRetries:           number
  checkpoint:           Checkpoint
  knownOutcomes:        KnownOutcome[]
  recoverableConditions: RecoverableCondition[]
}

interface ElementData {
  primary:   { type: string, value: string }
  secondary: { type: string, value: string }
  tertiary:  { type: string, value: string }
  fallback:  { type: 'coordinates', value: { x: number, y: number } }
}

interface Checkpoint {
  type:  'url-contains' | 'element-visible' | 'text-present'
  value: string
}

interface KnownOutcome {
  pattern: string
  type:    'business_outcome'
  reason:  string
}

interface RecoverableCondition {
  pattern: string
  action:  'dismiss' | 're-login' | 'retry'
}
```

### Run Log
```typescript
interface RunLog {
  runId:       string
  artifactId:  string
  tenantId:    string
  startedAt:   string
  completedAt: string
  status:      'success' | 'failed' | 'business_outcome' | 'stuck'
  outputs?:    Record<string, any>
  error?:      RunError
  steps:       RunStepLog[]
}

interface RunStepLog {
  stepNumber:           number
  startTime:            string
  endTime:              string
  retryCount:           number
  status:               'success' | 'failed' | 'stuck' | 'business_outcome' | 'recoverable'
  elementStrategyUsed:  'primary' | 'secondary' | 'tertiary' | 'fallback'
  screenshotUrl?:       string    // only on failure, omitted if sensitive: true
  errorDetails?:        string
}

interface RunError {
  step:     number
  expected: string
  observed: string
  type:     'hard_failure' | 'stuck'
}
```

### SQLite Schema
```sql
CREATE TABLE artifacts (
  artifactId     TEXT PRIMARY KEY,
  tenantId       TEXT NOT NULL,
  baseArtifactId TEXT,
  version        INTEGER NOT NULL,
  goal           TEXT NOT NULL,
  targetApp      TEXT NOT NULL,
  createdAt      TEXT NOT NULL,
  content        TEXT NOT NULL     -- full artifact JSON
);

CREATE TABLE sessions (
  tenantId     TEXT NOT NULL,
  domain       TEXT NOT NULL,
  storageState TEXT NOT NULL,      -- Playwright storage state JSON
  savedAt      TEXT NOT NULL,
  PRIMARY KEY (tenantId, domain)
);
```

---

## 5. API Design

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/v1/capture/run | Start a capture run with a natural language goal |
| POST | /api/v1/replay/run | Trigger deterministic replay with typed inputs |
| GET | /api/v1/runs/:runId/status | Poll current run status and intervention request |
| POST | /api/v1/runs/:runId/resume | Signal human handoff complete, resume automation |
| POST | /api/v1/runs/:runId/takeover | Confirm human is in control of the browser |
| GET | /api/v1/artifacts | List artifacts filtered by tenantId |
| GET | /api/v1/artifacts/:artifactId | Retrieve a specific artifact |
| DELETE | /api/v1/artifacts/:artifactId | Delete an artifact |

**Request / Response shapes:**

`POST /api/v1/capture/run`
```json
body:    { "goal": "string", "targetApp": "string", "tenantId": "string" }
returns: { "runId": "string", "status": "running" }
```

`POST /api/v1/replay/run`
```json
body:    { "artifactId": "string", "tenantId": "string", "inputs": {} }
returns: { "runId": "string", "status": "running" }
```

`GET /api/v1/runs/:runId/status`
```json
returns: {
  "status": "running | success | failed | business_outcome | stuck | login_required",
  "currentStep": 0,
  "outputs": {},
  "error": {}
}
```

---

## 6. Sequence Flows

### Capture Flow

1. Human → `POST /api/v1/capture/run`
2. Discovery Agent starts, Playwright opens Chromium (headless: false)
3. Loop: Screenshot → LLM → action decision → guardrails check → execute → DOM extract → checkpoint → append step
4. Goal met → Artifact saved to SQLite → Run log written to `/evidence/runs/`

*Note: Login handling added in Milestone 2. Test Milestone 1 against flows that do not require authentication.*

### Replay Flow

1. Caller → `POST /api/v1/replay/run`
2. Replay Engine reads artifact from SQLite
3. For each step: substitute parameters → try element strategies in order → execute → verify checkpoint
4. If knownOutcome matched → return business outcome
5. If recoverableCondition matched → handle and continue
6. If retryCount >= maxRetries → hard failure → stop
7. All steps pass → return `{ status, outputs }` to caller

### Human Escalation Flow (Replay)

1. Checkpoint fails after step execution
2. Replay Engine tries next elementData strategy (primary → secondary → tertiary → fallback)
3. All strategies exhausted → `retryCount++`
4. `retryCount >= maxRetries` → STUCK
5. Handoff Controller: `isPaused = true`, intervention request emitted
6. Operator UI displays: goal, step, reason, screenshot
7. Human clicks "Take over" → `POST /api/v1/runs/:runId/takeover`
8. Human operates live Chromium window manually
9. Human clicks "I'm finished" → `POST /api/v1/runs/:runId/resume { humanNotes }`
10. Before/after screenshots + human notes saved to run log
11. `isPaused = false` → Replay resumes from same step

### Login Detection Flow (Capture)

1. Discovery Agent navigating → LLM sees login page in screenshot
2. Agent pauses → `status: login_required`
3. Operator UI: "Login required — please log in manually"
4. Human logs in directly in live Chromium window
5. Human clicks "I'm finished" → `POST /api/v1/runs/:runId/resume`
6. Session Manager saves browser storage state (cookies + localStorage) per domain → SQLite
7. Agent resumes capture from logged-in state
8. If another site requires login mid-workflow → same pattern repeats

### Destructive Action Flow (Capture)

1. Discovery Agent: action classified as destructive by guardrails
2. Agent pauses → `status: confirmation_required`
3. Operator UI: "Destructive action requires confirmation"
4. Human reviews and confirms
5. `POST /api/v1/runs/:runId/resume`
6. Agent executes action and continues

---

## 7. Milestone 2 — Human Intervention + Escalation

### 7.1 Session Manager (`src/agent/session.ts`)

Handles credential capture during capture runs and session restoration before replay. Credentials are never stored anywhere — only session state (cookies + localStorage) is persisted.

**During capture:** LLM detects login page → agent pauses → human logs in live browser → Session Manager saves storage state per domain to SQLite → agent resumes.

**During replay:** Before replay starts, Session Manager reads stored session state from SQLite and restores it per domain via Playwright. All sites pre-authenticated — no human intervention for login. If session expires mid-replay, it is classified as a `recoverableCondition` → human re-logs in → session re-saved → resume.

**Key rule:** Replay never asks for credentials. It always uses the saved session.

---

### 7.2 Handoff Controller (`src/operator/handoff.ts`)

Manages pause, intervention request, and resume across capture and replay.

**Inputs:** `{ runId, reason, currentStep, screenshot, goal }`
**Outputs:** paused run state, intervention request sent to Operator UI

**Applies to:**
- Capture: login detection, destructive action, any stuck condition
- Replay: stuck detection, session expiry, destructive action

---

### 7.3 Operator UI (`operator-ui/`)

Minimal web page. Polls run status. Displays intervention request. Accepts human input.

**Elements:**
- Run status display (current step, goal, why stuck)
- Screenshot at time of stuck
- Natural language input field for human notes
- "Take over" button — confirms human is in control
- "I'm finished" button — triggers `POST /api/v1/runs/:runId/resume`

---

## 8. Error Handling

| Condition | Detection | Response |
|---|---|---|
| Business outcome | `knownOutcomes` pattern matched | Return `{ status: "business_outcome", reason }` |
| Recoverable condition | `recoverableConditions` pattern matched | Handle automatically, log, continue |
| Hard failure | elementData exhausted AND retryCount >= maxRetries | Stop, return `{ status: "failed", step, expected, observed }` |
| Stuck | Hard failure + operator UI escalation | Pause, emit intervention request, resume after human |
| Domain violation | URL outside allowlist | Stop immediately, return guardrail error |
| Write blocked | `allowWrites: false`, write action attempted | Block, return guardrail error |
| Destructive action | Action classified as destructive | Always escalate to human — no artifact can override |

---

## 9. Security and Guardrails

### Action Classification

| Class | Actions | Behaviour |
|---|---|---|
| Read-only | navigate, scroll, wait, click (nav/select), extract | Always permitted |
| Write | form submit, input to create/update, file upload | Permitted only if `allowWrites: true` in artifact |
| Destructive | delete, bulk remove, irreversible operations | Always escalate to human — no artifact can override |

### PII Redaction

- **Field-level:** `outputSchema` declares `sensitive: true` per field → value redacted in run log before write
- **Pattern-based fallback:** system-level regex catches SSN, credit card numbers, email addresses regardless of artifact declaration
- **Screenshot suppression:** steps marked `sensitive: true` → screenshot not saved; DOM extraction still runs

### Credential Handling

- Credentials never stored in artifact, logs, or environment variables
- Human enters credentials directly in live browser during capture
- Session state (cookies + localStorage) saved per domain after human login
- Restored before replay — all domains pre-authenticated
- Session expiry → `recoverableCondition` → human re-logs in

### Domain Allowlist

Defined per artifact. If browser navigates outside permitted domains → run stopped immediately.

---

## 10. Out of Scope / Future Work

| Item | Notes |
|---|---|
| Desktop app support (Phase 2) | Seam designed — swap DOM extractor to accessibility tree via CUA |
| Multi-tenant routing infrastructure | Schema supports `tenantId`, routing and queuing not built |
| Remote operator console | Human takeover is local only — same machine as running automation |
| Artifact confidence scoring | Score artifacts by replay stability |
| Code generation from artifact | Future stretch goal |
