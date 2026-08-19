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

export const router = Router()

// In-memory run state — keyed by runId
const runs = new Map<string, RunState>()

export function resetRuns(): void {
  runs.clear()
}

// ─── Capture ──────────────────────────────────────────────────────────────────

router.post('/capture/run', (req: Request, res: Response) => {
  const { goal, targetApp, tenantId } = req.body as CaptureRunRequest

  if (!goal || !targetApp || !tenantId) {
    res.status(400).json({ error: 'goal, targetApp, and tenantId are required' })
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

  runs.set(runId, state)

  // Fire and forget — discovery runs in background, updates state as it goes
  runDiscovery(state, goal, targetApp, tenantId).catch(err => {
    state.status = 'failed'
    console.error(`[capture] run ${runId} failed unexpectedly:`, err)
  })

  res.status(202).json({ runId, status: 'running' })
})

// ─── Replay ───────────────────────────────────────────────────────────────────

router.post('/replay/run', (req: Request, res: Response) => {
  const { artifactId, tenantId, inputs } = req.body as ReplayRunRequest

  if (!artifactId || !tenantId) {
    res.status(400).json({ error: 'artifactId and tenantId are required' })
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
    outputs:              state.log.outputs,
    error:                state.log.error,
    interventionRequest:  state.interventionRequest
  }

  res.json(response)
})

// ─── Run Log ──────────────────────────────────────────────────────────────────

router.get('/runs/:runId/log', (req: Request, res: Response) => {
  const { runId } = req.params
  if (!runs.has(runId)) {
    res.status(404).json({ error: `run ${runId} not found` })
    return
  }

  const logPath = path.join(process.cwd(), 'evidence', 'runs', `${runId}.json`)
  try {
    const raw = fs.readFileSync(logPath, 'utf-8')
    res.json({ log: JSON.parse(raw) })
  } catch {
    res.status(404).json({ error: 'log not yet available — run may still be in progress' })
  }
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
  const { tenantId } = req.query
  if (!tenantId || typeof tenantId !== 'string') {
    res.status(400).json({ error: 'tenantId query param is required' })
    return
  }

  const artifacts = findArtifactsByTenant(tenantId)
  res.json({ artifacts })
})

router.get('/artifacts/:artifactId', (req: Request, res: Response) => {
  const { tenantId } = req.query
  if (!tenantId || typeof tenantId !== 'string') {
    res.status(400).json({ error: 'tenantId query param is required' })
    return
  }

  const artifact = findArtifactById(req.params.artifactId, tenantId)
  if (!artifact) {
    res.status(404).json({ error: `artifact ${req.params.artifactId} not found` })
    return
  }

  res.json({ artifact })
})

router.delete('/artifacts/:artifactId', (req: Request, res: Response) => {
  const deleted = deleteArtifact(req.params.artifactId)
  if (!deleted) {
    res.status(404).json({ error: `artifact ${req.params.artifactId} not found` })
    return
  }

  res.json({ deleted: true })
})
