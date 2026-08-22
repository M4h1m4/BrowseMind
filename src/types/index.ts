// ─── Action & Status Enums ────────────────────────────────────────────────────

export type ActionType = 'click' | 'input' | 'navigate' | 'wait' | 'scroll' | 'keydown' | 'extract' | 'loop' | 'output'

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

export interface OutputField {
  header:   string   // CSV column name / JSON key
  variable: string   // e.g. "{{patientName}}"
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
  cssSelector?:          string
  variableName?:         string
  attribute?:            string
  isMutating?:           boolean        // true = modifies data (submit, delete, save); skipped during capture, executed during replay
  loopSelector?:         string
  innerSteps?:           Step[]
  outputFormat?:         'json' | 'csv'
  outputPath?:           string
  outputFields?:         OutputField[]
}

/** Replay-time variables discovered during capture, with their captured defaults. */
export type InputSchema = Record<string, { type: string; default?: string; sensitive?: boolean }>

export interface Artifact {
  artifactId:     string
  tenantId:       string
  baseArtifactId?: string
  version:        number
  goal:           string
  targetApp:      string
  allowedDomains?: string[]  // all domains the workflow may visit; defaults to [targetApp]
  createdAt:      string
  allowWrites:    boolean
  inputSchema:    InputSchema
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
  stepNumber:           number
  startTime:            string
  endTime:              string
  retryCount:           number
  status:               StepStatus
  elementStrategyUsed:  ElementStrategy
  sensitive:            boolean
  screenshotPath?:      string        // only on failure, never written when sensitive: true
  afterScreenshotPath?: string        // screenshot after human handoff
  humanNotes?:          string        // notes from human after escalation
  errorDetails?:        string        // redacted when sensitive: true
  pageStateAfter?:      string        // captured after mutating steps — visible text on the page post-action
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
  checkpointForPreviousStep: Checkpoint | null        // null on step 1
  action:                    ActionType
  coordinates?:              { x: number; y: number } // pixel coords in 1280x720 screenshot — required for click and scroll
  targetDescription:         string
  value:                     string | null
  reasoning:                 string
  requiresLogin:             boolean
  goalComplete:              boolean
  updatedSummary:            string
  isMutating?:               boolean                  // true if this action modifies data (form submit, delete, save) — skipped during capture dry run
  cssSelector?:              string
  variableName?:             string
  attribute?:                string
  loopSelector?:             string
  innerSteps?:               LLMAction[]
  outputFormat?:             'json' | 'csv'
  outputPath?:               string
  outputFields?:             OutputField[]
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
  /** Run that continues this one — the next data record from the goal. */
  chainedRunId?:        string
  /** Which record from the goal this run is processing, e.g. "Second patient". */
  sampleLabel?:         string
  /** Records from the goal still queued behind this run. */
  pendingSamples?:      number
}

// ─── API Request / Response Types ─────────────────────────────────────────────

export interface CaptureRunRequest {
  goal:           string
  targetApp:      string
  tenantId:       string
  allowedDomains?: string[]  // extra domains the workflow may visit (targetApp always included)
  /** Replay the artifact with captured defaults when the goal holds only one record. */
  autoReplay?:    boolean
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
  artifactId?:          string
  outputs?:             Record<string, unknown>
  error?:               RunError
  interventionRequest?: InterventionRequest
  chainedRunId?:        string
  sampleLabel?:         string
  pendingSamples?:      number
}
