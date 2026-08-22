import { Artifact, Step, LLMAction, ElementData, Checkpoint } from '../types'
import { generateArtifactId } from '../artifact/repository'

// Fields whose labels or placeholders indicate sensitive data
const SENSITIVE_FIELD_PATTERN = /password|passwd|pwd|secret|ssn|social.?security|credit.?card|cvv|\bpin\b/i

function isSensitiveStep(action: LLMAction, elementData: ElementData): boolean {
  if (action.action !== 'input') return false
  return (
    SENSITIVE_FIELD_PATTERN.test(elementData.primary.value) ||
    SENSITIVE_FIELD_PATTERN.test(elementData.secondary.value)
  )
}

function makeEmptyElementData(coords: { x: number; y: number } = { x: 0, y: 0 }): ElementData {
  return {
    primary:   { type: 'aria-label',   value: '' },
    secondary: { type: 'placeholder',  value: '' },
    tertiary:  { type: 'text-content', value: '' },
    fallback:  { type: 'coordinates' as const, value: coords }
  }
}

function buildInnerStep(action: LLMAction, stepNumber: number): Step {
  const elementData = makeEmptyElementData({ x: 0, y: 0 })

  const step: Step = {
    stepNumber,
    actionType:            action.action,
    description:           action.targetDescription,
    value:                 action.value ?? undefined,
    sensitive:             false,
    elementData,
    waitAfter:             200,
    maxRetries:            3,
    checkpoint:            { type: 'url-contains', value: '' },
    knownOutcomes:         [],
    recoverableConditions: []
  }

  // mutating flag
  if (action.isMutating) step.isMutating = true

  // extract
  if (action.action === 'extract') {
    step.cssSelector  = action.cssSelector
    step.variableName = action.variableName
    step.attribute    = action.attribute
  }

  // loop — recursively build inner steps
  if (action.action === 'loop') {
    step.loopSelector = action.loopSelector ?? action.cssSelector
    step.innerSteps   = (action.innerSteps ?? []).map((innerAction, idx) =>
      buildInnerStep(innerAction, idx + 1)
    )
  }

  // output
  if (action.action === 'output') {
    step.outputFormat = action.outputFormat
    step.outputPath   = action.outputPath
    step.outputFields = action.outputFields
  }

  return step
}

function hasOutputStep(steps: Step[]): boolean {
  for (const step of steps) {
    if (step.actionType === 'output') return true
    if (step.innerSteps && hasOutputStep(step.innerSteps)) return true
  }
  return false
}

/** Check if any step (recursively) is flagged as mutating — write workflows need allowWrites */
function hasMutatingStep(steps: Step[]): boolean {
  for (const step of steps) {
    if (step.isMutating) return true
    if (step.innerSteps && hasMutatingStep(step.innerSteps)) return true
  }
  return false
}

/** Recursively collect all variableNames from extract steps */
function collectExtractVars(steps: Step[]): Set<string> {
  const vars = new Set<string>()
  for (const step of steps) {
    if (step.actionType === 'extract' && step.variableName) {
      vars.add(step.variableName)
    }
    if (step.innerSteps) {
      for (const v of collectExtractVars(step.innerSteps)) vars.add(v)
    }
  }
  return vars
}

/** Split a camelCase or PascalCase variable name into lowercase keywords */
function splitVarToKeywords(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(w => w.length > 1)
}

/** Find the best fuzzy match for a variable name among known extract variables */
function fuzzyMatchVar(target: string, knownVars: Set<string>): string | null {
  const targetLower = target.toLowerCase()

  // 1. Case-insensitive exact match
  for (const v of knownVars) {
    if (v.toLowerCase() === targetLower) return v
  }

  // 2. One contains the other (e.g. "conditions" ↔ "patientConditions")
  for (const v of knownVars) {
    const vLower = v.toLowerCase()
    if (vLower.includes(targetLower) || targetLower.includes(vLower)) return v
  }

  // 3. Keyword overlap — split camelCase into words and find best match
  //    e.g. "activeConditions" → ["active","conditions"], "patientConditions" → ["patient","conditions"]
  //    Shared keyword "conditions" gives a match score
  const targetWords = splitVarToKeywords(target)
  let bestMatch: string | null = null
  let bestScore = 0
  for (const v of knownVars) {
    const vWords = splitVarToKeywords(v)
    const shared = targetWords.filter(w => vWords.includes(w)).length
    if (shared > bestScore) {
      bestScore = shared
      bestMatch = v
    }
  }
  if (bestMatch && bestScore >= 1) return bestMatch

  return null
}

/** Validate and auto-correct output field variables to match extract step variable names */
function reconcileOutputVars(steps: Step[]): void {
  const knownVars = collectExtractVars(steps)
  if (knownVars.size === 0) return

  for (const step of steps) {
    if (step.actionType === 'output' && step.outputFields) {
      for (const field of step.outputFields) {
        const raw = field.variable.replace(/^\{\{|\}\}$/g, '')
        if (knownVars.has(raw)) continue // exact match — all good

        const match = fuzzyMatchVar(raw, knownVars)
        if (match) {
          console.warn(
            `[builder] auto-corrected output variable "{{${raw}}}" → "{{${match}}}" (fuzzy match)`
          )
          field.variable = `{{${match}}}`
        } else {
          console.error(
            `[builder] output variable "{{${raw}}}" does not match any extract variable. Known: [${[...knownVars].join(', ')}]`
          )
        }
      }
    }
    if (step.innerSteps) reconcileOutputVars(step.innerSteps)
  }
}

/** Derive a camelCase variable name from a step description.
 *  e.g. "First Name field" → "firstName", "Date of Birth input" → "dateOfBirth" */
function descriptionToVarName(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0 && !['field', 'input', 'box', 'the', 'for', 'dropdown', 'select', 'enter', 'into', 'respective', 'text', 'textarea'].includes(w))

  if (words.length === 0) return 'input'
  return words[0] + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

export class ArtifactBuilder {
  private steps: Step[] = []
  private inputVars: Map<string, { type: string; default: string; sensitive: boolean }> = new Map()

  /**
   * Give the last step a real checkpoint.
   *
   * Steps normally get theirs from the NEXT LLM response ("what proves the
   * previous step worked"), so the final step of a run — the submit, the one that
   * matters most — is left holding the `url-contains ""` placeholder, which
   * `"anything".includes("")` makes impossible to fail. Discovery calls this with
   * the success signal it observed on the page.
   */
  setFinalCheckpoint(checkpoint: Checkpoint): void {
    if (this.steps.length === 0) return
    this.steps[this.steps.length - 1].checkpoint = checkpoint
  }

  addStep(action: LLMAction, elementData: ElementData, stepNumber: number): void {
    // The checkpoint in this LLM response proves the PREVIOUS step succeeded.
    // Apply it to the previous step before pushing the new one.
    if (action.checkpointForPreviousStep !== null && this.steps.length > 0) {
      this.steps[this.steps.length - 1].checkpoint = action.checkpointForPreviousStep
    }

    const sensitive = isSensitiveStep(action, elementData)

    // For input steps, templatize the value so replay can use different data
    // Sensitive steps are also templatized — the sensitive flag controls log redaction,
    // but the actual value must be available for replay to work
    let stepValue: string | undefined = action.value ?? undefined
    if (action.action === 'input' && action.value) {
      const varName = descriptionToVarName(action.targetDescription)
      // Avoid duplicate variable names by appending a number
      let uniqueVar = varName
      let counter = 2
      while (this.inputVars.has(uniqueVar) && this.inputVars.get(uniqueVar)!.default !== action.value) {
        uniqueVar = varName + counter
        counter++
      }
      this.inputVars.set(uniqueVar, { type: 'string', default: action.value, sensitive })
      stepValue = `{{${uniqueVar}}}`
    }

    const step: Step = {
      stepNumber,
      actionType:            action.action,
      description:           action.targetDescription,
      value:                 stepValue,
      sensitive,
      elementData,
      waitAfter:             200,
      maxRetries:            3,
      checkpoint:            { type: 'url-contains', value: '' }, // filled by next addStep call
      knownOutcomes:         [],
      recoverableConditions: []
    }

    // mutating flag
    if (action.isMutating) step.isMutating = true

    // extract
    if (action.action === 'extract') {
      step.cssSelector  = action.cssSelector
      step.variableName = action.variableName
      step.attribute    = action.attribute
    }

    // loop — recursively build inner steps
    if (action.action === 'loop') {
      step.loopSelector = action.loopSelector ?? action.cssSelector
      step.innerSteps   = (action.innerSteps ?? []).map((innerAction, idx) =>
        buildInnerStep(innerAction, idx + 1)
      )
    }

    // output
    if (action.action === 'output') {
      step.outputFormat = action.outputFormat
      step.outputPath   = action.outputPath
      step.outputFields = action.outputFields
    }

    this.steps.push(step)
  }

  build(goal: string, targetApp: string, tenantId: string, allowedDomains: string[] = []): Artifact {
    // Auto-correct any mismatched output variable names before building
    reconcileOutputVars(this.steps)

    // Build inputSchema from discovered input variables
    const inputSchema: Record<string, { type: string; default?: string; sensitive?: boolean }> = {}
    for (const [varName, info] of this.inputVars) {
      inputSchema[varName] = { type: info.type, default: info.default, sensitive: info.sensitive }
    }

    // targetApp is always in the allowed list
    const domains = Array.from(new Set([targetApp, ...allowedDomains]))
    return {
      artifactId:     generateArtifactId(),
      tenantId,
      version:        1,
      goal,
      targetApp,
      allowedDomains: domains,
      createdAt:      new Date().toISOString(),
      allowWrites:    hasOutputStep(this.steps) || hasMutatingStep(this.steps),
      inputSchema,
      outputSchema:   {},
      steps:          this.steps
    }
  }

  /**
   * Remove redundant steps (failed navigation retries) before building the artifact.
   * Uses two signals:
   *   1. Consecutive duplicate intent — same actionType + similar description in sequence;
   *      only the LAST step in the sequence is kept (the one that worked).
   *   2. Checkpoint hallucination — if the next step's checkpoint for the previous step
   *      was hallucinated, the previous step didn't achieve its goal.
   *
   * Only prunes click/navigate steps. Never prunes input, extract, loop, output, or
   * isMutating steps — those are always intentional.
   *
   * @param hallucinatedCheckpoints Set of step numbers whose checkpoint was hallucinated
   *        (meaning the PREVIOUS step didn't achieve what was expected)
   * @returns number of steps pruned
   */
  pruneRedundantSteps(hallucinatedCheckpoints: Set<number>): number {
    // Navigation steps (click/navigate) that aren't mutating can be pruned
    const isNavPrunable = (s: Step) =>
      (s.actionType === 'click' || s.actionType === 'navigate') && !s.isMutating

    // Input steps can be pruned ONLY when consecutive with same description AND same value
    // (the LLM typed the exact same thing in the same field twice — a clear retry)
    const isInputDuplicate = (a: Step, b: Step) =>
      a.actionType === 'input' && b.actionType === 'input' &&
      isSimilar(a.description, b.description) &&
      (a.value ?? '') === (b.value ?? '')

    // Normalize description for similarity comparison
    const normalize = (d: string) => d.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

    // Two descriptions are similar if one contains the other or they share >60% words
    const isSimilar = (a: string, b: string): boolean => {
      const na = normalize(a)
      const nb = normalize(b)
      if (na.includes(nb) || nb.includes(na)) return true
      const wordsA = new Set(na.split(' '))
      const wordsB = new Set(nb.split(' '))
      const overlap = [...wordsA].filter(w => wordsB.has(w)).length
      const maxLen = Math.max(wordsA.size, wordsB.size)
      return maxLen > 0 && overlap / maxLen > 0.6
    }

    // Check if two consecutive steps form a duplicate pair (either nav retries or input retries)
    const isDuplicatePair = (a: Step, b: Step): boolean => {
      // Nav retries: same action type + similar description
      if (isNavPrunable(a) && isNavPrunable(b) &&
          a.actionType === b.actionType &&
          isSimilar(a.description, b.description)) return true
      // Input retries: same description + same value
      if (isInputDuplicate(a, b)) return true
      return false
    }

    // ── Step 1: Find consecutive groups of duplicate steps ──────────────
    // e.g. [click "Patients tab", click "Patients tab", click "Patients tab"]
    // or   [input "Date of Birth" = "1983-06-14", input "Date of Birth" = "1983-06-14"]
    // Within each group, keep ONLY the last step (the one that finally worked).
    const toRemove = new Set<number>()
    let groupStart = -1

    for (let i = 0; i <= this.steps.length; i++) {
      const step = i < this.steps.length ? this.steps[i] : null
      const prev = i > 0 ? this.steps[i - 1] : null

      // Check if current step continues the previous group
      const continuesGroup = step && prev && isDuplicatePair(prev, step)

      if (continuesGroup) {
        if (groupStart < 0) groupStart = i - 1
      } else {
        // Group ended — prune all but the last in the group
        if (groupStart >= 0) {
          const groupEnd = i - 1 // last step in the group (kept)
          for (let j = groupStart; j < groupEnd; j++) {
            toRemove.add(j)
            console.log(`[builder] pruning step ${this.steps[j].stepNumber}: "${this.steps[j].description}" — retry (keeping last in sequence)`)
          }
          groupStart = -1
        }
      }
    }

    // ── Step 2: Consecutive mutating clicks with same target ─────────────
    // When the LLM generates a second click on the same button (typically to
    // verify the submission succeeded), the earlier click's checkpoint may be
    // self-referential (describes the button, not the success outcome). Keep
    // only the last click in the sequence — it's the one with the real
    // setFinalCheckpoint from discovery's post-submit detection.
    for (let i = 1; i < this.steps.length; i++) {
      if (toRemove.has(i - 1)) continue
      const prev = this.steps[i - 1]
      const curr = this.steps[i]
      if (!prev.isMutating || !curr.isMutating) continue
      if (prev.actionType !== 'click' || curr.actionType !== 'click') continue
      if (!isSimilar(prev.description, curr.description)) continue
      // only prune if the earlier click's checkpoint is self-referential
      const cpText = prev.checkpoint.value.toLowerCase()
      const descText = normalize(prev.description)
      if (cpText && descText.includes(cpText)) {
        toRemove.add(i - 1)
        console.log(`[builder] pruning step ${prev.stepNumber}: "${prev.description}" — duplicate mutating click (keeping the one with verified checkpoint)`)
      }
    }

    // ── Step 3: Checkpoint hallucination — prune isolated nav steps ─────
    // (not already in a consecutive group) where the next step's checkpoint
    // was hallucinated AND the next step is a retry of the same nav action
    for (let i = 0; i < this.steps.length; i++) {
      if (toRemove.has(i)) continue // already pruned by group logic
      const step = this.steps[i]
      if (!isNavPrunable(step)) continue

      const nextStepNumber = step.stepNumber + 1
      if (hallucinatedCheckpoints.has(nextStepNumber)) {
        // Only prune if the next step is the same kind of nav action with similar description.
        // Different intents should not be pruned —
        // e.g. "Patients tab" → "Add New Patient" are separate intentional steps.
        if (
          i + 1 < this.steps.length &&
          isNavPrunable(this.steps[i + 1]) &&
          isSimilar(step.description, this.steps[i + 1].description)
        ) {
          toRemove.add(i)
          console.log(`[builder] pruning step ${step.stepNumber}: "${step.description}" — next step checkpoint hallucinated`)
        }
      }
    }

    if (toRemove.size === 0) return 0

    // Remove pruned steps and re-number
    this.steps = this.steps.filter((_, i) => !toRemove.has(i))
    this.steps.forEach((s, i) => { s.stepNumber = i + 1 })

    return toRemove.size
  }

  getStepCount(): number {
    return this.steps.length
  }
}
