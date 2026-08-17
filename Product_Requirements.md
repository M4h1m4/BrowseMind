# Product Requirements — Computer-Use Automation System

## Overview
A backend system that lets AI agents operate legacy web applications with no API by recording an LLM-driven run as a reusable capability artifact and replaying it deterministically in production.

## Personas
**Human** — triggers discovery, intervenes when automation is stuck, and resumes after manual takeover.
**AI Agent** — invokes saved capabilities via API with typed inputs, receives typed outputs.

## User Journeys
**Discovery:** Human types a natural language goal → LLM navigates live browser → artifact saved.
**Replay:** AI Agent calls replay API with inputs → system executes without LLM → returns typed outputs or structured error.
**Escalation:** Automation stuck → intervention request sent → Human takes over live browser → signals done → automation resumes.

## Functional Requirements
**Discovery:** Accept a natural language goal and target application. Run an LLM-driven observe → decide → act loop until goal is met or stopping condition is hit. Extract stable element signals at each step. Save a structured, versioned artifact on completion.

**Artifact:** Capture ordered steps, ranked element targeting strategies, typed inputs/outputs, checkpoints, known business outcomes, and recoverable conditions per step. Tenant-scoped with optional base artifact inheritance. Must never contain credentials or PII.

**Deterministic Replay:** Re-execute without LLM. Locate elements via stored strategies in priority order. Classify failures as business outcome, recoverable condition, or hard failure. Return typed outputs on success.

**Human Escalation:** Detect when automation cannot proceed and pause. Emit intervention request with goal, step, reason, and screenshot. Expose same live browser for human control. On signal: preserve session state and resume. Record intervention with before/after screenshot and notes.

**Safety:** Enforce per-artifact domain allowlist. Classify actions as read-only, write, or destructive — block destructive actions. Never persist credentials or PII.

## Non-Functional Requirements

| Requirement | Description |
|---|---|
| Determinism | Same artifact + inputs = same result on a stable UI |
| Recoverability | Resumes after human handoff with no session loss |
| Auditability | Every run produces a structured log sufficient to debug any failure |
| Security | No secrets in artifacts or logs. Credentials via environment variables only |
| Extensibility | Schema and replay engine support desktop surfaces without changes |
| Tenant isolation | Artifacts scoped to tenants. Base artifacts inherited but not mutated |

## Limitations
- Web surfaces only — desktop support designed but not built
- Multi-tenant infrastructure deferred — schema supports it, routing not built
- Discovery run required before replay is available

## Appendix
**Tech Stack:** TypeScript · Node.js · Playwright · Claude API · SQLite · Express.js

**API Surface:** POST /api/v1/discovery/run · POST /api/v1/replay/run · GET /api/v1/runs/:runId/status · POST /api/v1/runs/:runId/resume · GET /api/v1/artifacts · GET /api/v1/artifacts/:artifactId

**Artifact Schema:** Header — artifactId, tenantId, baseArtifactId, version, goal, targetApp, inputSchema, outputSchema, steps[]. Per step — stepNumber, actionType, description, elementData (primary → secondary → tertiary → coordinates), waitAfter, maxRetries, checkpoint, knownOutcomes[], recoverableConditions[], errorClassification.
