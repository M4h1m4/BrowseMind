# Decisions

---

## Decision 1: Target Application

### Phase 1 — Consistent UI, No Clean DOM
Legacy apps where the UI looks the same every time but the underlying HTML is a mess. No test IDs, no semantic elements, no stable selectors. The page is predictable visually but not programmatically.

This is the primary target and what the assessment is built around.

**Decision: OrangeHRM demo (`opensource-demo.orangehrmlive.com`)**
- HR management system, legacy-style UI
- Multi-step flows: login → search employee → view details
- Publicly accessible, stable
- Looks and feels like a real enterprise back-office app — close to what interface.ai actually automates

### Phase 2 — Inconsistent UI (with or without clean DOM)
Apps where the UI itself changes — layout shifts, dynamic content, A/B variants, or fast-moving consumer sites. Clean DOM or not doesn't matter here because the bigger problem is that the page doesn't look the same between runs.

This is the expansion scope once Phase 1 is solved.

---

## Decision 2: How the System is Triggered (Discovery vs Replay)

### Discovery — Natural language text input (human-triggered)
A human types a goal in plain text:
```
"Login to OrangeHRM and search for employee John Doe and return their ID"
```
- Matches how the PDF frames it: "take a goal in natural language"
- Easy to demo and show in evidence logs

### Replay — API call (AI agent-triggered)
An AI agent calls the saved capability programmatically:
```json
{
  "artifactId": "search-employee",
  "inputs": { "employeeName": "John Doe" }
}
```
- The PDF explicitly says replay is how an AI agent invokes the capability in production
- An API is the natural interface for an AI agent calling a tool

### The full flow
```
Human types goal (text)
        ↓
Discovery run (LLM + screenshot)
        ↓
Artifact saved
        ↓
AI agent calls API with inputs
        ↓
Deterministic replay executes
        ↓
Returns typed outputs to caller
```

---

## Decision 3: UI Mechanism — The Hybrid Approach

### Decision
- **Phase 1 (web — OrangeHRM):** Screenshot + Coordinates + DOM extraction
- **Phase 2 (desktop):** Screenshot + Coordinates + Accessibility tree via CUA (Option B)

### How it works

During discovery, the LLM uses screenshots to navigate — sees the page visually, decides where to click, acts. At each step, in parallel, DOM extraction captures stable signals from that element (text, placeholder, aria-label, role, position). Both coordinates and DOM attributes are stored in the artifact.

During replay, no LLM and no screenshots. Replay uses the stored DOM attributes to find the element deterministically and act on it.

```
DISCOVERY (LLM involved):
Screenshot → LLM decides what to click
                    ↓
         Playwright clicks x, y
                    ↓
         DOM extraction runs on that element
         captures: label, placeholder, aria-label, role, position
                    ↓
         Artifact stores coordinates + DOM attributes per step

REPLAY (no LLM):
Stored DOM attributes → find element deterministically → act → verify checkpoint
```

### Phase 2: Desktop — Option B (CUA + Accessibility tree)
```
Discovery:  Screenshot → CUA SDK → OS-level input event at x,y
            + Accessibility tree extraction on that element
Replay:     Accessibility tree attributes → find element → act
```
- CUA handles discovery natively on desktop — only sees pixels, works on anything
- OS-level events work on any desktop surface
- No browser dependency at all
- Playwright cannot control native desktop apps — CUA removes that dependency entirely

### Why this hybrid stands apart from singular approaches

**Screenshot + Coordinates alone (discovery AND replay):**
- Discovery works — LLM sees the page, navigates freely
- Replay breaks — coordinates are brittle. Window 10px wider, page renders slightly differently → wrong element clicked with no fallback. Fails silently.

**DOM extraction alone (discovery AND replay):**
- Replay works — stable, deterministic element targeting
- Discovery breaks — on legacy apps with no clean DOM, you can't reliably identify elements upfront using selectors. The LLM needs to see the page to navigate it.

**The hybrid:**
- Screenshots solve the discovery problem — LLM navigates any surface visually, no DOM dependency
- DOM extraction solves the replay problem — deterministic element targeting without LLM or coordinates
- They are not competing — they solve different problems at different phases

```
Screenshots    → covers discovery on no-clean-DOM surfaces
DOM extraction → covers deterministic replay without LLM
```

### The seam between phases
The extractor is the only thing that changes between Phase 1 and Phase 2:
- Phase 1 (web): DOM extraction via `page.evaluate()`
- Phase 2 (desktop): Accessibility tree via OS APIs

The artifact schema stays identical across both phases. The replay engine stays identical. Only the extractor underneath swaps.

---

## Decision 4: Artifact Schema

### Artifact Header (capability definition)
```
artifactId          — unique identifier for this capability
tenantId            — which institution this artifact belongs to
baseArtifactId      — if this is a tenant-specific override, references the base artifact
version             — version number of the artifact
goal                — natural language goal (e.g. "search for employee and return their ID")
targetApp           — which app this runs against (e.g. OrangeHRM)
createdAt           — timestamp of when this artifact was recorded
inputSchema         — typed definition of inputs the caller supplies (e.g. { employeeName: string })
outputSchema        — typed definition of what gets returned (e.g. { employeeId: string })
steps[]             — ordered list of steps
```

### Per Step
```
stepNumber             — ordinal position (1, 2, 3...)
actionType             — click | input | navigate | wait | scroll | keydown
description            — human-readable description of what this step does
elementData:
  primary              — { type: "aria-label", value: "..." }
  secondary            — { type: "placeholder", value: "..." }
  tertiary             — { type: "text-content", value: "..." }
  fallback             — { type: "coordinates", value: { x, y } }
value                  — the value to use at this step. Can be hardcoded ("Search") or reference an input parameter ("{{employeeName}}") — substituted from inputSchema at runtime
waitAfter              — ms to wait after executing this action
maxRetries             — how many times replay should retry before giving up
checkpoint             — condition that verifies this step succeeded
knownOutcomes:         — pre-defined business outcome patterns for this step
  - pattern            — text/state to look for on the page
    type               — "business_outcome"
    reason             — machine-readable reason (e.g. "employee_not_found")
recoverableConditions: — pre-defined interstitials replay can handle automatically
  - pattern            — text/state to look for on the page
    action             — what to do (e.g. "dismiss", "re-login", "retry")
errorClassification:
  business             — expected outcomes caller needs to know (e.g. "employee not found")
  recoverable          — conditions replay handles itself (e.g. dismiss a dialog, retry)
  hard                 — failures that stop execution and surface a debuggable error
```

### NOT in artifact (lives in run log instead)
```
screenshotUrl       — run-specific, captured on failure
startTime           — run-specific
endTime             — run-specific
retryCount          — how many times this step was attempted in this run
status              — run-specific (success | stuck | failed)
errorDetails        — run-specific
```

### Why this separation
The artifact is a reusable capability definition — it stays the same across every replay run. The run log is run-specific evidence that changes every time. Mixing them would make the artifact polluted with execution details that have no place in a reusable capability.

---

## Decision 5: Artifact Storage

**SQLite** — single `.db` file, no server needed, structured enough to query across artifacts and tenants.

### Database schema
```
artifacts table:
  artifactId      — unique identifier
  tenantId        — scoped to institution
  baseArtifactId  — references base artifact if this is a tenant override
  version         — artifact version
  goal            — natural language goal
  targetApp       — target application
  createdAt       — creation timestamp
  content         — full artifact JSON stored as a blob
```

### File structure
```
/db/artifacts.db              — SQLite database (all artifacts)
/evidence/runs/               — run logs and screenshots (file system, run-specific)
```

### Multi-tenant organization
Tenant scoping is handled via `tenantId` in the database, not via folder structure. Query by tenantId to get all artifacts for an institution.

### Why SQLite
- No server required — single file, ships with the repo
- Structured enough to query across tenants and versions
- When deploying at scale, swap to PostgreSQL — queries stay the same, only the connection changes

---

## Decision 6: Error Taxonomy

Three buckets, detected per step during replay:

**Bucket 1 — Business Outcome**
The system worked but the result is a legitimate "no" answer. Not a crash.
- Detected via `knownOutcomes` patterns pre-defined in the artifact per step
- Examples: "No records found", "Invalid credentials", "Insufficient permissions"
- Replay returns: `{ status: "business_outcome", reason: "employee_not_found" }`

**Bucket 2 — Recoverable Condition**
Something unexpected happened but replay can handle it without human intervention.
- Detected via `recoverableConditions` patterns pre-defined in the artifact per step
- Examples: session timeout dialog, confirmation dialog, slow page load
- Replay handles automatically, logs it, continues

**Bucket 3 — Hard Failure**
Cannot recover. Stop and surface a clear debuggable error.
- Detected when elementData strategies exhausted, or retryCount >= maxRetries, or unknown page state
- Replay returns: `{ status: "failed", step: 3, expected: "...", observed: "..." }`

**Stuck — escalate to human**
```
checkpoint fails
AND all elementData strategies tried (primary → secondary → tertiary → fallback)
AND retryCount >= maxRetries
→ STUCK → escalate to human operator
```
Stuck is not a hard failure — it means "I cannot proceed, I need a human." Hard failure means something is definitively broken.

Page state comparison is NOT used for stuck detection. The checkpoint is the reliable signal — not whether the page changed. "Page did not change" is not the same as stuck — a wrong action could leave the page unchanged while the system is still capable of recovering with a different strategy.

---

## Decision 7: Human-in-the-Loop Escalation & Handoff

### Stuck Detection
```
checkpoint fails
AND all elementData strategies tried (primary → secondary → tertiary → fallback)
AND retryCount >= maxRetries
→ STUCK → pause automation → trigger escalation
```
Page state comparison is not used. The checkpoint is the reliable signal.

### How the handoff works

Run Playwright in **non-headless mode** (visible Chromium window) throughout the entire run — both during automation and human intervention. The browser is always visible on screen.

```
Discovery/Replay runs
        ↓
Chromium window visible — shows automation progress in real time
        ↓
Automation gets stuck
        ↓
Operator UI shows intervention request:
  - goalDescription
  - currentStepNumber
  - currentStepDescription
  - whyStuck
  - screenshotAtTimeOfStuck
  - artifactId
  - runId
        ↓
Human reads context, types natural language instructions, clicks "Take over"
        ↓
Automation loop pauses (isPaused = true)
        ↓
Same Chromium window now under human control
Human types, clicks, navigates directly in the browser
        ↓
Human clicks "I'm finished" in operator UI
        ↓
POST /api/v1/runs/:runId/resume called
        ↓
Session state preserved (cookies, login state) — Playwright resumes same browser instance
        ↓
Automation resumes from same step with updated browser state
```

### What gets recorded across the handoff
- Before screenshot (at time of stuck)
- After screenshot (when human clicks "I'm finished")
- Human's natural language instructions
- Log entry: human intervention occurred at this step

### What we build vs mock
- Chromium visible browser — real (headless: false, one line change)
- Pause/resume loop — real
- `POST /api/v1/runs/:runId/resume` endpoint — real
- Operator UI (intervention request + Take over + I'm finished buttons + natural language input) — minimal but real
- Real-time co-browsing/stream player — not needed, browser is local and visible directly

---

## Decision 8: Technology Stack

**Language:** TypeScript
**Runtime:** Node.js
**Browser automation:** Playwright (TypeScript — primary SDK)
**LLM:** Anthropic Claude (screenshot → decide → act during discovery)
**Database:** SQLite via `better-sqlite3`
**API framework:** Express.js (for replay API + operator UI + resume endpoint)

**Why TypeScript:**
- Playwright is natively TypeScript first — best SDK, best docs, best community support
- DOM extraction via `page.evaluate()` runs JavaScript in the browser — TypeScript wrapping it is the most natural fit
- Anthropic and OpenAI both have excellent TypeScript SDKs
- Internship experience is TypeScript — patterns already known

---

## Decision 9: Project Structure

```
/
├── src/
│   ├── agent/
│   │   ├── discovery.ts        — LLM-driven discovery loop
│   │   ├── replay.ts           — deterministic replay engine
│   │   └── extractor.ts        — DOM extraction at each step
│   ├── artifact/
│   │   ├── schema.ts           — artifact type definitions
│   │   ├── repository.ts       — SQLite read/write
│   │   └── validator.ts        — artifact validation
│   ├── guardrails/
│   │   └── policy.ts           — allowlist enforcement
│   ├── operator/
│   │   └── handoff.ts          — pause/resume, intervention request
│   ├── api/
│   │   └── routes.ts           — all API endpoints
│   ├── db/
│   │   └── client.ts           — SQLite connection
│   └── types/
│       └── index.ts            — shared TypeScript types
├── operator-ui/                — minimal web UI for human handoff
├── evidence/
│   ├── artifacts/              — saved example artifacts
│   └── runs/                   — run logs and screenshots
├── db/
│   └── artifacts.db            — SQLite database
├── .env                        — API keys, config
├── package.json
├── tsconfig.json
├── README.md
└── REPORT.md
```

---

## Decision 10: API Endpoints

```
POST   /api/v1/discovery/run
       body: { goal: string, targetApp: string, tenantId: string }
       returns: { runId, artifactId, status, steps }

POST   /api/v1/replay/run
       body: { artifactId: string, tenantId: string, inputs: Record<string, any> }
       returns: { runId, status, outputs, error }

GET    /api/v1/runs/:runId
       returns: { runId, status, steps, logs }

GET    /api/v1/runs/:runId/status
       returns: { status, currentStep, stuck, interventionRequest }

POST   /api/v1/runs/:runId/resume
       body: { humanNotes: string }
       returns: { status, resumedAt }

GET    /api/v1/artifacts
       query: { tenantId? }
       returns: { artifacts[] }

GET    /api/v1/artifacts/:artifactId
       returns: { artifact }

DELETE /api/v1/artifacts/:artifactId
       returns: { deleted: true }
```

---

## Decision 12: Credential Handling & Session Management

### During Capture
The LLM detects login pages via screenshot — no hardcoding needed. When a login page is detected mid-workflow:
```
LLM sees login page in screenshot
        ↓
Agent pauses — operator UI prompts human to log in
        ↓
Human logs in manually in live Chromium browser
        ↓
Agent resumes from logged-in state
        ↓
Session cookies saved for that domain
        ↓
If another site requires login mid-workflow → same pattern repeats
```

- Works for any number of sites in a multi-site workflow
- Credentials never touch the artifact, logs, or environment variables
- Login page detection is a first-class pause condition during capture — same pause/resume mechanism as human escalation

### During Replay
```
Playwright restores saved session cookies per domain
        ↓
No login needed — session already active
        ↓
If session expires mid-replay → detected as recoverable condition → pause → human re-logs in → resume
```

### Session State Storage
- After capture: Playwright saves full browser storage state (cookies + localStorage) per domain
- Before replay: storage state restored — all domains in the workflow are pre-authenticated
- Session expiry mid-replay: classified as `recoverableCondition` — already covered by Decision 6

### What this means for multi-site workflows
Same architecture handles single and multi-site workflows. Each domain gets its own session saved during capture. Replay restores all of them. No site-specific configuration needed.

---

## Decision 13: Guardrails

### Action Safety

Three action classes — defined at system level, applied per artifact:

**Read-only — always safe, never escalate:**
- navigate, scroll, wait, read/extract data, click for navigation or selection

**Write — configurable via artifact-level flag:**
```
allowWrites: true | false
```
When `false` → any write action blocked at runtime. When `true` → write actions permitted. Human toggles this before triggering replay. Applies to: form submission, typing into fields that create/update records, file upload.

**Destructive — always escalate to human, no artifact can override:**
- delete, permanently remove, bulk operations, anything irreversible
- Rule is system-level — hardcoded, not configurable

### PII Redaction — Two Layers

**Layer 1: Field-level redaction (artifact-driven)**
outputSchema declares which fields are sensitive:
```
outputSchema:
  employeeId:  { type: string, sensitive: false }
  salary:      { type: string, sensitive: true }
  ssn:         { type: string, sensitive: true }
```
Anything marked `sensitive: true` → value redacted in logs, never stored.

**Layer 2: Pattern-based redaction (system-level fallback)**
Common PII patterns caught regardless of artifact declaration:
- SSN format (xxx-xx-xxxx)
- Credit card numbers
- Email addresses
- Currency amounts

### Screenshot Handling on Sensitive Steps

Artifact marks sensitive steps with a flag:
```
sensitive: true
```
At sensitive steps:
- Screenshot → not saved (suppressed)
- DOM extraction → still runs (continuity maintained for replay)
- Extracted values marked sensitive → redacted before writing to log

Continuity is maintained through DOM state, not screenshots. Screenshots are evidence only — DOM extraction is what replay depends on.

---

## Decision 14: Milestones

### Milestone 1 — Capture → Artifact → Replay (no human intervention)
The thinnest end-to-end slice. Proves the core pipeline works.

**Scope:**
- Capture run — LLM navigates via screenshot, DOM extraction at each step, artifact saved to SQLite
- Login page detection — LLM detects login page, pauses, human logs in, session saved
- Deterministic replay — reads artifact, finds elements via stored DOM attributes, verifies checkpoints, returns typed outputs
- Basic error handling — business outcome and hard failure classified and returned
- Parameter substitution — `{{parameterName}}` values substituted from inputSchema at runtime
- Domain allowlist enforced
- Run logs written to `/evidence/runs/`
- No human escalation (stuck handling deferred to Milestone 2)

**Done when:** full capture → artifact → replay loop works on OrangeHRM with at least one error case handled correctly.

---

### Milestone 2 — Human Intervention + Escalation + Hardening
Takes the working prototype and adds robustness, human intervention, and demo readiness.

**Scope:**
- Stuck detection during replay — retryCount >= maxRetries AND page state unchanged
- Human escalation — operator UI shows intervention request, human takes over live browser, resume works
- Human intervention during capture — mid-workflow login pause generalised to any stuck condition during capture
- Recoverable conditions — session timeout, confirmation dialogs handled automatically
- PII redaction — field-level + pattern-based, sensitive step screenshot suppression
- allowWrites flag — toggle write operations on/off per artifact
- Destructive action escalation — always route to human
- Multi-tenant — tenantId scoping, baseArtifactId inheritance
- Operator UI polished
- Evidence complete — discovery + replay logs, error case replay
- README and REPORT.md written

**Done when:** full system works reliably, human escalation tested, evidence folder complete, ready to submit.

---

## Decision 15: LLM Prompt Design

### Model
GPT-4o mini as primary — cost effective, vision capable. Swap to Claude Haiku 4.5 if vision quality is insufficient on legacy UI surfaces.

### Context window strategy — Sliding window with summarization
```
Keep last N=10 full steps in context + 1 running summary of earlier steps
        ↓
Same LLM call returns action decision + updatedSummary
        ↓
When window slides: drop oldest full step, carry forward updatedSummary
```
- N = 10 (configurable)
- Summarization done by the same LLM in the same call — no separate summarization call
- The LLM that just acted on the page is best placed to summarize what happened

### Structured response via function calling
Use OpenAI function calling (or Claude tool use) to enforce structured JSON response. Prevents hallucinated formats.

```json
{
  "action": "click | input | navigate | wait | scroll | keydown",
  "targetDescription": "human description of target element",
  "value": "value to type if action is input, null otherwise",
  "reasoning": "why this action achieves the goal",
  "requiresLogin": false,
  "goalComplete": false,
  "updatedSummary": "compact summary of all steps taken so far"
}
```

### Max steps
| Phase | Default | Range |
|---|---|---|
| Capture | 25 | 25-30, configurable |
| Replay | 35 | 35-45, configurable |

Capture has lower limit — if LLM cannot achieve the goal in 25 steps, the goal likely needs to be broken down. Replay has higher limit — deterministic execution can take longer on slow or complex pages.

---

## Decision 16: Checkpoint Generation During Capture

### Decision
Checkpoints are **not verified during capture** — they are **generated from observed post-action state** and stored in the artifact for replay to verify.

### How it works
```
LLM decides action
        ↓
Playwright executes action
        ↓
Post-action screenshot taken
        ↓
Same screenshot sent to LLM in next iteration
LLM observes actual resulting page state and answers:
  "What on this page proves the previous action succeeded?"
        ↓
That label becomes the checkpoint stored in the artifact for that step
```

### Why not let the LLM predict the checkpoint before the action
The LLM cannot reliably predict what the page will look like after an action on a legacy app it has never seen before. A predicted checkpoint is a hallucination. An observed checkpoint is ground truth — the LLM is labeling what actually happened, not guessing what might happen.

### What this means for the function call schema
`checkpointForPreviousStep` added to the function call response:
```json
{
  "checkpointForPreviousStep": {
    "type":  "url-contains | element-visible | text-present",
    "value": "what on this page proves the previous action succeeded"
  }
}
```
- Null on step 1 (no previous action)
- From step 2 onwards: LLM declares checkpoint based on what it observes in the post-action screenshot

### Split between capture and replay
| Phase | Checkpoint role |
|---|---|
| Capture | LLM observes post-action state and labels the meaningful signal — stored in artifact |
| Replay | System checks the stored signal deterministically — no LLM needed |

---

## Decision 11: Success Criteria

```
Discovery:
  ✓ LLM completes the goal against live OrangeHRM
  ✓ Artifact saved to SQLite with all steps, elementData, checkpoints
  ✓ Evidence logged in /evidence/runs/

Replay:
  ✓ Runs without LLM
  ✓ Finds elements via stored DOM attributes
  ✓ Verifies checkpoints at each step
  ✓ Returns typed outputs to caller
  ✓ Handles at least one error case (business outcome or hard failure)

Human escalation:
  ✓ Stuck detected correctly
  ✓ Intervention request shown in operator UI
  ✓ Human takes over live browser
  ✓ Automation resumes after handoff
  ✓ Handoff recorded in run log

Safety:
  ✓ Domain allowlist enforced
  ✓ No credentials in artifact or logs
```

---
