// ─── Action & Status Enums ────────────────────────────────────────────────────

export type ActionType = 'click' | 'input' | 'navigate' | 'wait' | 'scroll' | 'keydown'

export type RunStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'business_outcome'
  | 'stuck'
  | 'login_required'
  | 'confirmation_required'

export type RunType = 'capture' | 'replay'

export type ElementStrategy = 'primary' | 'secondary' | 'tertiary' | 'fallback'

export type StepStatus = 'success' | 'failed' | 'stuck' | 'business_outcome' | 'recoverable'

// ─── Artifact Schema ──────────────────────────────────────────────────────────

export interface ElementData {
  primary:   { type: string; value: string }
  secondary: { type: string; value: string }
  tertiary:  { type: string; value: string }
  fallback:  { type: 'coordinates'; value: { x: number; y: number } }
}

export interface Checkpoint {
  type:  'url-contains' | 'element-visible' | 'text-present'
  value: string
}

export interface KnownOutcome {
  pattern: string
  type:    'business_outcome'
  reason:  string
}

export interface RecoverableCondition {
  pattern: string
  action:  'dismiss' | 're-login' | 'retry'
}

export interface Step {
  stepNumber:            number
  actionType:            ActionType
  description:           string
  value?:                string         // hardcoded or "{{parameterName}}"
  sensitive:             boolean
  elementData:           ElementData
  waitAfter:             number
  maxRetries:            number
  checkpoint:            Checkpoint
  knownOutcomes:         KnownOutcome[]
  recoverableConditions: RecoverableCondition[]
}

export interface Artifact {
  artifactId:     string
  tenantId:       string
  baseArtifactId?: string
  version:        number
  goal:           string
  targetApp:      string
  createdAt:      string
  allowWrites:    boolean
  inputSchema:    Record<string, { type: string }>
  outputSchema:   Record<string, { type: string; sensitive: boolean }>
  steps:          Step[]
}

// ─── Run Log ──────────────────────────────────────────────────────────────────

export interface RunError {
  step:     number
  expected: string
  observed: string
  type:     'hard_failure' | 'stuck'
}

export interface RunStepLog {
  stepNumber:          number
  startTime:           string
  endTime:             string
  retryCount:          number
  status:              StepStatus
  elementStrategyUsed: ElementStrategy
  screenshotPath?:     string        // only on failure, omitted if sensitive: true
  errorDetails?:       string
}

export interface RunLog {
  runId:       string
  type:        RunType
  artifactId?: string
  tenantId:    string
  goal:        string
  startedAt:   string
  completedAt?: string
  status:      RunStatus
  outputs?:    Record<string, unknown>
  error?:      RunError
  steps:       RunStepLog[]
}

// ─── LLM Function Call Schema ─────────────────────────────────────────────────

export interface LLMAction {
  checkpointForPreviousStep: Checkpoint | null   // null on step 1
  action:                    ActionType
  targetDescription:         string
  value:                     string | null
  reasoning:                 string
  requiresLogin:             boolean
  goalComplete:              boolean
  updatedSummary:            string
}

// ─── Runtime State ────────────────────────────────────────────────────────────

export interface InterventionRequest {
  runId:           string
  goalDescription: string
  currentStep:     number
  whyStuck:        string
  screenshotPath?: string
  artifactId?:     string
}

export interface RunState {
  runId:                string
  type:                 RunType
  status:               RunStatus
  artifactId?:          string
  tenantId:             string
  currentStep:          number
  isPaused:             boolean
  interventionRequest?: InterventionRequest
  startedAt:            string
  log:                  RunLog
}

// ─── API Request / Response Types ─────────────────────────────────────────────

export interface CaptureRunRequest {
  goal:      string
  targetApp: string
  tenantId:  string
}

export interface ReplayRunRequest {
  artifactId: string
  tenantId:   string
  inputs:     Record<string, unknown>
}

export interface ResumeRunRequest {
  humanNotes: string
}

export interface RunStatusResponse {
  runId:                string
  status:               RunStatus
  currentStep:          number
  outputs?:             Record<string, unknown>
  error?:               RunError
  interventionRequest?: InterventionRequest
}
