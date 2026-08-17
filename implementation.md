# Implementation Plan — Computer-Use Automation System

---

## Overview

Eight phases, each producing something runnable before moving to the next. Every phase is target-application agnostic — `targetApp` is runtime input, not hardcoded logic. OrangeHRM is used only as the test vehicle to verify each phase works.

Phases 1–5 deliver Milestone 1 (Capture → Artifact → Replay).
Phases 6–8 deliver Milestone 2 (Session Management + Human Escalation + Polish).

---

## Phase 1 — Project Scaffold

**What gets built:**
- TypeScript + Node.js + Express setup
- SQLite schema (`artifacts` + `sessions` tables)
- All TypeScript type definitions (`schema.ts`, `index.ts`)
- `.env` config and folder structure per Decision 9

**Done when:** server starts, DB initializes, all types compile with no errors.

---

## Phase 2 — Discovery Agent (Capture Core)

**What gets built:**
- Playwright opens a visible Chromium browser (headless: false)
- Screenshot captured and sent to LLM with goal and sliding context window
- LLM responds via function calling: action + `checkpointForPreviousStep`
- Playwright executes the action
- DOM Extractor runs on the acted-on element — captures primary, secondary, tertiary, fallback
- Artifact builder accumulates steps
- Artifact saved to SQLite on goal complete
- Run log written to `/evidence/runs/`

**Done when:** LLM navigates a live web app end-to-end and a complete artifact lands in the database.

---

## Phase 3 — Replay Engine

**What gets built:**
- Reads artifact from SQLite
- Substitutes `{{parameter}}` values from caller inputs
- Finds elements via stored DOM attributes in priority order (primary → secondary → tertiary → fallback)
- Verifies checkpoint at each step
- Classifies failures: business outcome, recoverable condition, hard failure
- Returns typed outputs to caller on success

**Done when:** replay re-runs a captured artifact without LLM involvement and returns correct typed outputs.

---

## Phase 4 — API Layer

**What gets built:**
- All Express routes wired to Discovery Agent and Replay Engine
- Async run tracking — runId assigned on start, status polled via GET
- `POST /api/v1/capture/run`
- `POST /api/v1/replay/run`
- `GET /api/v1/runs/:runId/status`
- `GET /api/v1/artifacts`
- `GET /api/v1/artifacts/:artifactId`
- `DELETE /api/v1/artifacts/:artifactId`

**Done when:** capture and replay are triggered and polled entirely via API with no direct function calls.

---

## Phase 5 — Guardrails

**What gets built:**
- Domain allowlist enforcement — browser navigation outside permitted domains stops the run immediately
- Action classification — read-only / write / destructive at system level
- `allowWrites` flag respected at runtime — write actions blocked when flag is false
- Destructive actions always escalated (wired up fully in Phase 7, flag set here)

**Done when:** navigation outside allowlist is blocked, write actions blocked when `allowWrites: false`.

---

## Phase 6 — Session Management

**What gets built:**
- Login page detection during capture — LLM signals `requiresLogin: true` in function call response
- Agent pauses on login detection → operator notified → human logs in directly in live browser
- Playwright saves full browser storage state (cookies + localStorage) per domain to SQLite `sessions` table
- Before replay starts: Session Manager reads stored session state and restores per domain via Playwright
- All sites pre-authenticated — no human login needed during replay

**Done when:** capture handles a login-required flow correctly and replay runs fully authenticated with no manual login.

---

## Phase 7 — Human Escalation

**What gets built:**
- Stuck detection: `retryCount >= maxRetries` after all element strategies exhausted
- Handoff Controller: sets `isPaused = true`, emits intervention request
- `POST /api/v1/runs/:runId/takeover` endpoint
- `POST /api/v1/runs/:runId/resume` endpoint
- Operator UI: displays goal, current step, reason, screenshot — "Take over" and "I'm finished" controls
- Before/after screenshots and human notes saved to run log on resume
- Recoverable conditions handled automatically (session expiry, confirmation dialogs)

**Done when:** stuck is detected correctly, human takes over the live browser, automation resumes from the same step with preserved session state.

---

## Phase 8 — Evidence and Polish

**What gets built:**
- PII redaction — field-level (`sensitive: true` in outputSchema) + pattern-based fallback (SSN, card numbers, email)
- Sensitive step screenshot suppression — screenshot not saved if `sensitive: true` on step
- Run logs written to `/evidence/runs/` for every run with full step detail
- Screenshot captured and attached to run log on failure
- End-to-end test — capture + replay + one escalation scenario verified on a live app
- README and REPORT.md written

**Done when:** system is submission-ready — full pipeline works, evidence folder is complete, all safety requirements met.

---

## Dependency Order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8
```

Each phase depends on the previous. No parallel tracks — sequential keeps each phase testable in isolation before building on top of it.
