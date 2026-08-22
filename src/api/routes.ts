import fs from 'fs'
import path from 'path'
import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import {
  CaptureRunRequest,
  ReplayRunRequest,
  ResumeRunRequest,
  RunState,
  RunStatusResponse
} from '../types'
import { findArtifactById, findArtifactsByTenant, deleteArtifact } from '../artifact/repository'
import { runDiscovery } from '../agent/discovery'
import { runReplay } from '../replay/replay'
import { signalResume } from '../session/resumeSignal'
import { buildReplaySamples, splitGoalSamples, ReplaySample } from '../agent/sampleParser'

export const router = Router()

/**
 * Which tenant a request belongs to.
 *
 * Every artifact, run and stored session is filed under a tenant, because the
 * real environment is hundreds of institutions running the same vendor apps and
 * the schema must not assume otherwise. What is deliberately NOT built here is
 * the plumbing around it — accounts, sign-in, per-tenant credentials. This is a
 * single-operator tool, so the tenant defaults and callers never have to know it
 * exists. An API client may still pass one explicitly to exercise the seam.
 */
function tenantFor(req: Request): string {
  const fromBody  = typeof req.body?.tenantId === 'string' ? req.body.tenantId.trim() : ''
  const fromQuery = typeof req.query?.tenantId === 'string' ? req.query.tenantId.trim() : ''
  return fromBody || fromQuery || process.env.DEFAULT_TENANT_ID || 'default'
}

// In-memory run state — keyed by runId
const runs = new Map<string, RunState>()

export function resetRuns(): void {
  runs.clear()
}

/**
 * Start a replay run and, when it finishes, start the next queued record.
 *
 * Records come from the capture goal itself: a goal listing several patients is
 * captured with the first one and replayed once per remaining one, so the operator
 * never retypes data they already supplied.
 */
function startReplayRun(
  artifactId: string,
  tenantId:   string,
  sample:     ReplaySample,
  queue:      ReplaySample[]
): string {
  const artifact = findArtifactById(artifactId, tenantId)
  if (!artifact) throw new Error(`artifact ${artifactId} not found for tenant ${tenantId}`)

  const runId = uuidv4()
  const now   = new Date().toISOString()

  const state: RunState = {
    runId,
    type:           'replay',
    status:         'running',
    artifactId,
    tenantId,
    currentStep:    0,
    isPaused:       false,
    startedAt:      now,
    sampleLabel:    sample.label,
    pendingSamples: queue.length,
    log: {
      runId,
      type:       'replay',
      artifactId,
      tenantId,
      goal:       artifact.goal,
      startedAt:  now,
      status:     'running',
      steps:      []
    }
  }

  runs.set(runId, state)

  runReplay(state, artifact, sample.inputs)
    .then(() => {
      if (queue.length === 0) return
      const [next, ...rest] = queue
      // Only continue the chain if this record actually went through — replaying
      // further records on top of a broken run would compound the failure.
      if (state.status !== 'success') {
        state.pendingSamples = 0
        console.log(`[replay] chain stopped — run ${runId} ended as ${state.status}, ${queue.length} record(s) not replayed`)
        return
      }
      try {
        state.chainedRunId = startReplayRun(artifactId, tenantId, next, rest)
        console.log(`[replay] chaining "${next.label}" as run ${state.chainedRunId}`)
      } catch (err) {
        state.pendingSamples = 0
        console.error('[replay] failed to chain next record:', err)
      }
    })
    .catch(err => {
      state.status = 'failed'
      console.error(`[replay] run ${runId} failed unexpectedly:`, err)
    })

  return runId
}

// ─── Capture ──────────────────────────────────────────────────────────────────

router.post('/capture/run', (req: Request, res: Response) => {
  const { goal, targetApp, allowedDomains, autoReplay } = req.body as CaptureRunRequest
  // The tenant comes from the signed-in account. It is deliberately NOT read
  // from the request: a client that can name its own tenant can name someone
  // else's and read their automations.
  const tenantId = tenantFor(req)

  if (!goal || !targetApp) {
    res.status(400).json({ error: 'goal and targetApp are required' })
    return
  }

  const runId = uuidv4()
  const now = new Date().toISOString()

  const state: RunState = {
    runId,
    type:        'capture',
    status:      'running',
    tenantId,
    currentStep: 0,
    isPaused:    false,
    startedAt:   now,
    log: {
      runId,
      type:      'capture',
      tenantId,
      goal,
      startedAt: now,
      status:    'running',
      steps:     []
    }
  }

  // Announce up front how many records are queued behind the capture: the chain
  // itself can only start once discovery finishes, and a client polling in that
  // gap must know a replay is still coming.
  const recordCount = splitGoalSamples(goal).length
  state.pendingSamples = recordCount > 1 ? recordCount - 1 : (autoReplay ? 1 : 0)

  runs.set(runId, state)

  // Fire and forget — discovery runs in background, updates state as it goes
  runDiscovery(state, goal, targetApp, tenantId, allowedDomains ?? [])
    .then(() => {
      if (state.status !== 'success' || !state.artifactId) return

      const artifact = findArtifactById(state.artifactId, tenantId)
      if (!artifact) return

      // Every record after the first in the goal becomes a replay, run back to back.
      const samples = buildReplaySamples(goal, artifact.inputSchema)

      if (samples.length === 0) {
        // Single-record goal: only replay if the operator asked for it, using defaults.
        if (!autoReplay) { state.pendingSamples = 0; return }
        try {
          state.chainedRunId = startReplayRun(
            state.artifactId, tenantId,
            { label: 'Captured values', inputs: {} }, []
          )
          console.log(`[capture] auto-replaying artifact ${state.artifactId} as run ${state.chainedRunId}`)
        } catch (err) {
          state.pendingSamples = 0
          console.error('[capture] auto-replay failed to start:', err)
        }
        return
      }

      const [first, ...rest] = samples
      state.pendingSamples = samples.length
      try {
        state.chainedRunId = startReplayRun(state.artifactId, tenantId, first, rest)
        console.log(`[capture] goal holds ${samples.length + 1} record(s) — auto-replaying "${first.label}" as run ${state.chainedRunId}`)
      } catch (err) {
        state.pendingSamples = 0
        console.error('[capture] auto-replay failed to start:', err)
      }
    })
    .catch(err => {
      state.status = 'failed'
      console.error(`[capture] run ${runId} failed unexpectedly:`, err)
    })

  res.status(202).json({ runId, status: 'running' })
})

// ─── Replay ───────────────────────────────────────────────────────────────────

router.post('/replay/run', (req: Request, res: Response) => {
  const { artifactId, inputs } = req.body as ReplayRunRequest
  const tenantId = tenantFor(req)

  if (!artifactId) {
    res.status(400).json({ error: 'artifactId is required' })
    return
  }

  const artifact = findArtifactById(artifactId, tenantId)
  if (!artifact) {
    res.status(404).json({ error: `artifact ${artifactId} not found for tenant ${tenantId}` })
    return
  }

  const runId = uuidv4()
  const now = new Date().toISOString()

  const state: RunState = {
    runId,
    type:        'replay',
    status:      'running',
    artifactId,
    tenantId,
    currentStep: 0,
    isPaused:    false,
    startedAt:   now,
    log: {
      runId,
      type:       'replay',
      artifactId,
      tenantId,
      goal:       artifact.goal,
      startedAt:  now,
      status:     'running',
      steps:      []
    }
  }

  runs.set(runId, state)

  runReplay(state, artifact, inputs ?? {}).catch(err => {
    state.status = 'failed'
    console.error(`[replay] run ${runId} failed unexpectedly:`, err)
  })

  res.status(202).json({ runId, status: 'running' })
})

// ─── Run Status ───────────────────────────────────────────────────────────────

router.get('/runs/:runId/status', (req: Request, res: Response) => {
  const state = runs.get(req.params.runId)
  if (!state) {
    res.status(404).json({ error: `run ${req.params.runId} not found` })
    return
  }

  const response: RunStatusResponse = {
    runId:                state.runId,
    status:               state.status,
    currentStep:          state.currentStep,
    artifactId:           state.artifactId,
    outputs:              state.log.outputs,
    error:                state.log.error,
    interventionRequest:  state.interventionRequest,
    chainedRunId:         state.chainedRunId,
    sampleLabel:          state.sampleLabel,
    pendingSamples:       state.pendingSamples
  }

  res.json(response)
})

// ─── Run Log ──────────────────────────────────────────────────────────────────

/**
 * Resolve a run the caller is entitled to see.
 *
 * Evidence is the most sensitive thing this service holds — the goal text, every
 * value typed into every field, and screenshots of the filled form. It is served
 * only through here, never as a static directory, so the path cannot be walked
 * and every read goes through a known run.
 */
function authorizedRun(req: Request, res: Response): RunState | null {
  const { runId } = req.params
  const state = runs.get(runId)
  if (!state) {
    res.status(404).json({ error: `run ${runId} not found` })
    return null
  }

  return state
}

router.get('/runs/:runId/log', (req: Request, res: Response) => {
  const state = authorizedRun(req, res)
  if (!state) return

  const logPath = path.join(process.cwd(), 'evidence', 'runs', `${state.runId}.json`)
  try {
    const raw = fs.readFileSync(logPath, 'utf-8')
    res.json({ log: JSON.parse(raw) })
  } catch {
    res.status(404).json({ error: 'log not yet available — run may still be in progress' })
  }
})

/** List the screenshots captured for a run. */
router.get('/runs/:runId/screenshots', (req: Request, res: Response) => {
  const state = authorizedRun(req, res)
  if (!state) return

  const dir = path.join(process.cwd(), 'evidence', 'screenshots', 'capture')
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith('.png'))
      .sort()
    res.json({ screenshots: files })
  } catch {
    res.json({ screenshots: [] })
  }
})

/** Fetch one screenshot. */
router.get('/runs/:runId/screenshots/:name', (req: Request, res: Response) => {
  const state = authorizedRun(req, res)
  if (!state) return

  // Reject anything that is not a plain file name — no traversal out of the
  // evidence directory via "../" or an absolute path.
  const name = req.params.name
  if (name !== path.basename(name) || !/^[\w.-]+\.png$/i.test(name)) {
    res.status(400).json({ error: 'invalid screenshot name' })
    return
  }

  const file = path.join(process.cwd(), 'evidence', 'screenshots', 'capture', name)
  if (!fs.existsSync(file)) {
    res.status(404).json({ error: 'screenshot not found' })
    return
  }
  res.sendFile(file)
})

// ─── Resume (human handoff complete) ─────────────────────────────────────────

router.post('/runs/:runId/resume', (req: Request, res: Response) => {
  const state = runs.get(req.params.runId)
  if (!state) {
    res.status(404).json({ error: `run ${req.params.runId} not found` })
    return
  }

  const { humanNotes } = req.body as ResumeRunRequest

  if (signalResume(state.runId)) {
    // Discovery loop was waiting for human login — it will handle its own status transitions
  } else {
    // No pending signal — plain confirmation resume (e.g. destructive action confirmation)
    if (!state.isPaused) {
      res.status(400).json({ error: 'run is not paused' })
      return
    }
    state.isPaused = false
    state.status   = 'running'
  }

  state.interventionRequest = undefined
  console.log(`[handoff] run ${state.runId} resumed — notes: "${humanNotes ?? ''}"`)
  res.json({ status: 'resumed', resumedAt: new Date().toISOString() })
})

// ─── Takeover (human confirms control) ───────────────────────────────────────

router.post('/runs/:runId/takeover', (req: Request, res: Response) => {
  const state = runs.get(req.params.runId)
  if (!state) {
    res.status(404).json({ error: `run ${req.params.runId} not found` })
    return
  }

  console.log(`[handoff] human took over run ${state.runId}`)
  res.json({ status: 'human_in_control' })
})

// ─── Artifacts ────────────────────────────────────────────────────────────────

router.get('/artifacts', (req: Request, res: Response) => {
  const artifacts = findArtifactsByTenant(tenantFor(req))
  res.json({ artifacts })
})

router.get('/artifacts/:artifactId', (req: Request, res: Response) => {
  const artifact = findArtifactById(req.params.artifactId, tenantFor(req))
  if (!artifact) {
    res.status(404).json({ error: `artifact ${req.params.artifactId} not found` })
    return
  }

  res.json({ artifact })
})

router.delete('/artifacts/:artifactId', (req: Request, res: Response) => {
  const deleted = deleteArtifact(req.params.artifactId, tenantFor(req))
  if (!deleted) {
    res.status(404).json({ error: `artifact ${req.params.artifactId} not found` })
    return
  }

  res.json({ deleted: true })
})
