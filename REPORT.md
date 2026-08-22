# BrowseMind — Design Report

## 1. Architecture

### Overview
BrowseMind is a **capture-once, replay-many** computer-use automation system. It records an LLM-driven browser session (capture) as a **typed, versioned artifact**, then replays that artifact **deterministically** without the LLM in the loop. Human escalation is built into both phases when the system cannot safely proceed.

### Core Components

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| **Discovery (Capture)** | LLM-driven observe-decide-act loop against live browser; extracts stable element selectors; builds artifact | Playwright + GPT-4o |
| **Artifact Builder** | Accumulates LLM actions into typed `Artifact`; assigns stable selectors; prunes redundant steps | TypeScript builder pattern |
| **Artifact Schema** | Typed, versioned JSON with steps, selectors, checkpoints, inputs/outputs, known outcomes | TypeScript types + runtime validation |
| **Replay Engine** | Executes artifact steps without LLM; locates elements via ranked strategies; verifies checkpoints | Playwright (headed) |
| **Human Escalation** | Pauses on stuck/destructive/confirmation; exposes live browser; resumes after human intervention | Signal-based handoff + headed replay |
| **Safety Guardrails** | Domain allowlist, action classification (read/write/destructive), PII redaction | Regex-based classification + domain allowlist |
| **API Layer** | Capture/replay endpoints, run status, resume/handoff, artifact CRUD | Express + in-memory run store + SQLite |

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Capture = LLM, Replay = No LLM** | LLM is expensive & non-deterministic; use it once to *discover*, then replay deterministically |
| **Headed replay** | Human escalation requires a visible browser session; Playwright headed mode enables live handoff |
| **Ranked element strategies** | `primary` (semantic: aria-label/placeholder) → `secondary` (text/label) → `tertiary` (CSS) → `fallback` (coordinates). Survives DOM drift |
| **Checkpoint per step** | Verifies actual outcome after each step (not just that the action executed) |
| **Multi-sample goals** | Single capture with first record; goal encodes multiple data records via ordinal markers ("Second patient:", "2.", "---") → automatic replay chaining |
| **Signal-based handoff** | `waitForHandoff`/`signalHandoff` decouples automation from UI; no WebSocket needed |
| **PII redaction at log time** | `sensitive: true` steps redact values in logs; `screenshotPath` omitted for sensitive steps |

---

## 2. Artifact Schema

The artifact is a **self-contained, typed, versioned capability** that an AI agent can invoke with typed inputs and receive typed outputs.

```typescript
interface Artifact {
  artifactId: string;           // UUID
  tenantId: string;             // multi-tenant isolation
  baseArtifactId?: string;      // for cross-tenant inheritance
  version: number;              // schema version
  goal: string;                 // natural-language goal (first sample only)
  targetApp: string;            // entry URL
  allowedDomains: string[];     // domain allowlist for guardrails
  createdAt: string;            // ISO timestamp
  allowWrites: boolean;         // true for write workflows
  inputSchema: InputSchema;     // typed inputs with defaults from first sample
  outputSchema: OutputSchema;   // typed outputs from extract steps
  steps: Step[];                // ordered, with selectors, checkpoints, outcomes
}
```

### Step Structure
Each step captures **how to locate** and **what to verify**:

```typescript
interface Step {
  stepNumber: number;
  actionType: 'click' | 'input' | 'navigate' | 'wait' | 'scroll' | 'keydown' | 'extract' | 'loop' | 'output';
  description: string;
  value?: string;                    // hardcoded or "{{parameterName}}"
  sensitive: boolean;                // PII redaction
  elementData: ElementData;          // 4-tier selector strategy
  waitAfter: number;
  maxRetries: number;
  checkpoint: Checkpoint;            // 'url-contains' | 'element-visible' | 'text-present'
  knownOutcomes: KnownOutcome[];     // expected business outcomes (e.g., "record not found")
  recoverableConditions: RecoverableCondition[]; // dismissable dialogs, etc.
  cssSelector?: string;              // for extract steps
  variableName?: string;             // for extract steps
  isMutating?: boolean;              // write flag
  loopSelector?: string;
  innerSteps?: Step[];               // for loop steps
  outputFormat?: 'json' | 'csv';
  outputPath?: string;
  outputFields?: OutputField[];
}
```

### Element Targeting: 4-Tier Fallback
```typescript
interface ElementData {
  primary:   { type: string; value: string };   // aria-label, placeholder, id
  secondary: { type: string; value: string };   // label text, role
  tertiary:  { type: string; value: string };   // CSS selector
  fallback:  { type: 'coordinates'; value: {x,y} };
}
```
Resolution order: **primary → secondary → tertiary → fallback**. Replay tries each until one succeeds.

### Parameterization & Multi-Sample
- **Capture uses only the first record** from the goal
- **Replay chaining**: remaining records auto-replay via `buildReplaySamples` which:
  1. Splits goal by ordinal markers ("Second:", "2.", "---", "Patient #2:")
  2. Extracts field values from each record
  3. Maps to `inputSchema` variables via label matching (fuzzy + value matching)
  4. Runs replay sequentially with each record's inputs

---

## 3. Determinism & Error Handling

### Deterministic Replay
- **No LLM** in replay loop — pure deterministic execution
- **Ranked selector resolution** survives DOM drift
- **Per-step checkpoints** verify actual page state after each action
- **Fixed viewport** (1280×720) for coordinate stability
- **Deterministic delays** (`waitAfter`, `page.waitForTimeout`)

### Error Taxonomy (3 Categories)

| Category | Definition | Handling |
|----------|------------|----------|
| **Business Outcome** | Expected, valid result (e.g., "record not found", "insufficient funds") | Step succeeds; outcome recorded; caller decides |
| **Recoverable Condition** | Known intermittent issue (modal, slow load, session expiry) | Auto-retry with configured action (`dismiss`, `re-login`, `retry`) |
| **Hard Failure** | Unexpected error, unrecoverable, or max retries exhausted | Run fails; structured error logged; escalation triggered |

### Stuck Detection & Escalation
- **Element not found** after all strategies + retries → `stuck`
- **Checkpoint failure** after max retries → `stuck` (since fix: `Checkpoint failed` also triggers)
- **Destructive action** (delete/remove/destroy) → `confirmation_required` (human must approve)
- **Destructive + mayEscalate=true** → `stuck` with handoff → human takes live browser control

### Page State Capture
- `pageStateAfter` captured after mutating steps (visible text from alerts, toasts, main content)
- Screenshots on stuck (`before`/`after`) stored in `evidence/screenshots/`

---

## 4. Heterogeneity & Multi-Tenant

### Surface Abstraction
The replay engine is **surface-agnostic** — it operates on:
- **Element coordinates** (Playwright)
- **Semantic selectors** (aria-label, placeholder, label text)
- **CSS selectors** (tertiary)
- **Coordinates** (fallback)

This maps to:
- **Modern web apps** → aria-label / placeholder (primary)
- **Legacy web** (framesets, tables, no IDs) → label text / text content / coordinates (secondary/tertiary/fallback)
- **Desktop apps** (future) → accessibility tree / coordinates

The artifact schema captures **what to do**, not **how the DOM looks**. The `elementData` 4-tier strategy is the abstraction seam.

### Multi-Tenant Reuse
- **Base artifact + per-tenant overrides**: `baseArtifactId` links tenant-specific artifacts to a shared base
- **Per-tenant selectors**: `allowedDomains` + per-tenant selector overrides in artifact
- **Parameterized routes**: Goal encoding (`/patient/{{patientId}}`) generalizes across tenants running same vendor product
- **Schema supports it** (`baseArtifactId`, `allowedDomains`, `inputSchema` per tenant); routing not built (deferred per PRD)

---

## 5. Escalation & Handoff

### Triggers
| Trigger | Condition | State |
|---------|-----------|-------|
| **Stuck** | Element not found / checkpoint failed after retries | `stuck` |
| **Destructive** | Action matches `delete\|remove\|destroy\|wipe\|drop\|purge\|clear all` | `confirmation_required` |
| **Login Required** | LLM signals `requiresLogin` | `login_required` |

### Handoff Mechanism
1. **Automation pauses** → sets `status = 'stuck'` / `confirmation_required`
2. **InterventionRequest** created with: runId, goal, step, whyStuck, screenshot, artifactId
3. **UI renders** stuck/confirmation banner with screenshot + notes textarea
4. **Human acts** in the **same live browser session** (headed Playwright)
5. **Human clicks Resume** → `signalHandoff(runId, notes)` resolves `waitForHandoff`
6. **Automation resumes** → retries the stuck step → continues

### Control Transfer Model
- **Same live session** — not a fresh browser
- **Preserved context** — cookies, localStorage, auth state, current page
- **Evidence preserved** — before/after screenshots + humanNotes logged
- **No co-browsing** — minimal mock operator UI (PRD scope); real handoff mechanism is real

### Destructive Action Confirmation
- Detected via `classifyAction` (regex: `delete|remove|destroy|wipe|drop|purge|clear all`)
- **Both capture & replay** pause for `confirmation_required`
- UI shows: "Approve — Continue" / "Cancel Run"
- Human approval → replay continues; cancellation → run fails

---

## 6. Safety

### Domain Allowlist
- `allowedDomains` in artifact (defaults to `[targetApp]`)
- Navigation outside allowlist → blocked + hard failure
- Subdomain matching supported (e.g., `app.example.com` matches `*.example.com`)

### Action Classification
```typescript
function classifyAction(actionType, description): 'read-only' | 'write' | 'destructive'
```
| Class | Actions | Handling |
|-------|---------|----------|
| `read-only` | wait, scroll, navigate, extract, loop | Always allowed |
| `write` | click, input, keydown, output | Allowed if `allowWrites=true` |
| `destructive` | description matches `delete\|remove\|destroy\|wipe\|drop\|purge\|clear all` | `confirmation_required` in both capture & replay |

### PII & Secrets Handling
- **Automatic detection**: regex on element labels (`ssn`, `password`, `credit card`, `pin`, `secret`)
- **Capture**: `sensitive: true` flag on steps → values redacted in logs (`[REDACTED]`)
- **Artifact**: `sensitive: true` steps have values templatized (`"{{ssnLast4}}"`)
- **Log redaction**: `screenshotPath` omitted for sensitive steps; values scrubbed from `RunLog`
- **No secrets in artifacts** — inputSchema stores defaults, not real secrets

### Output Safety
- `outputSchema` defines what the agent gets back
- `sensitive: true` on output fields → redacted in logs
- No raw credentials or tokens persisted anywhere

---

## 7. Cuts & Future Work

### Deliberate Cuts
| Feature | Why Cut | Effort to Add |
|---------|---------|---------------|
| **Desktop automation** | PRD scope: web only; Playwright supports CDP but not OS-level | Medium (accessibility tree + coordinates) |
| **Multi-tenant routing** | Schema supports (`baseArtifactId`, overrides); routing infra deferred | Low (API + tenant resolution) |
| **Real-time co-browsing** | PRD: minimal mock operator UI sufficient; WebRTC/websockets out of scope | High |
| **Confidence/approval gates** | Stretch goal; artifact approval state (draft→approved) not built | Low |
| **Assisted LLM fallback on replay failure** | Stretch goal; bounded LLM recovery per step | Medium |
| **Cross-tenant canonicalization** | Stretch goal; normalize `/item/123` → `/item/:id` | Medium |
| **Multi-run stability/flakiness score** | Stretch goal; replay N times, report flakiness | Low |

### What to Build Next (Priority Order)
1. **Multi-tenant routing** — API + tenant resolution to unlock cross-tenant reuse
2. **Assisted LLM fallback** — bounded recovery on replay failure (single step, policy-checked)
3. **Confidence scoring + approval gates** — artifact stability score, draft→approved gate
4. **Canonicalization / cross-tenant override** — parameterize routes, per-variant overrides
5. **Desktop surface adapter** — accessibility tree + coordinates for native apps
6. **Real-time operator console** — WebSocket + co-browsing if real operators needed

---

## Appendix: Key Files Reference

| File | Purpose |
|------|---------|
| `src/types/index.ts` | Core types: Artifact, Step, Checkpoint, RunState, RunLog, ActionType, ElementData |
| `src/agent/discovery.ts` | Capture loop: LLM-driven observe-decide-act + post-submit success detection |
| `src/agent/builder.ts` | Artifact assembly, step building, pruning, output reconciliation, variable mapping |
| `src/agent/sampleParser.ts` | Multi-sample goal splitting (ordinal markers, numbered lists, repeated structure) |
| `src/replay/replay.ts` | Deterministic replay loop, ranked selector resolution, checkpoint verification, stuck detection, handoff |
| `src/replay/guardrails.ts` | `classifyAction`, `isAllowedDomain`, domain allowlist |
| `src/agent/sampleParser.ts` | Goal splitting, field extraction, replay sample generation |
| `src/session/handoffSignal.ts` | `waitForHandoff`, `signalHandoff`, `cancelHandoff` |
| `src/session/resumeSignal.ts` | `waitForResume`, `signalResume` (login handoff) |
| `src/api/routes.ts` | `/capture/run`, `/replay/run`, `/runs/:id/status`, `/runs/:id/resume`, artifact CRUD |
| `src/artifact/repository.ts` | Artifact persistence (SQLite + file export to `evidence/artifacts/`) |
| `src/agent/logger.ts` | `writeRunLog` → `evidence/runs/<runId>.json` + SQLite |
| `src/ui/index.html` | Operator UI: goal input, run status, stuck/confirmation banners, resume/cancel |

---