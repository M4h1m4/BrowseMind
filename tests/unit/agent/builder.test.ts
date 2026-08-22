import { ArtifactBuilder } from '../../../src/agent/builder'
import { LLMAction, ElementData } from '../../../src/types'

const makeElementData = (): ElementData => ({
  primary:   { type: 'aria-label',   value: 'Test Label' },
  secondary: { type: 'placeholder',  value: 'Type here' },
  tertiary:  { type: 'text-content', value: 'Submit' },
  fallback:  { type: 'coordinates',  value: { x: 100, y: 200 } }
})

const makeAction = (overrides: Partial<LLMAction> = {}): LLMAction => ({
  checkpointForPreviousStep: null,
  action:            'click',
  coordinates:       { x: 100, y: 200 },
  targetDescription: 'Submit button',
  value:             null,
  reasoning:         'Click submit to proceed',
  requiresLogin:     false,
  goalComplete:      false,
  updatedSummary:    'Clicked submit',
  ...overrides
})

describe('ArtifactBuilder', () => {
  let builder: ArtifactBuilder

  beforeEach(() => {
    builder = new ArtifactBuilder()
  })

  describe('addStep', () => {
    it('increments step count after each addStep call', () => {
      builder.addStep(makeAction(), makeElementData(), 1)
      expect(builder.getStepCount()).toBe(1)

      builder.addStep(makeAction(), makeElementData(), 2)
      expect(builder.getStepCount()).toBe(2)
    })

    it('applies checkpointForPreviousStep to the previous step before pushing the new one', () => {
      // Step 1 — first step, no previous step to apply checkpoint to
      builder.addStep(makeAction({ checkpointForPreviousStep: null }), makeElementData(), 1)

      // Step 2 LLM response contains proof that step 1 succeeded
      const checkpointForStep1 = { type: 'url-contains' as const, value: '/dashboard' }
      builder.addStep(
        makeAction({ checkpointForPreviousStep: checkpointForStep1 }),
        makeElementData(),
        2
      )

      const artifact = builder.build('Test goal', 'https://example.com', 'tenant-001')
      // Step 1 should now have the checkpoint declared in the step 2 LLM response
      expect(artifact.steps[0].checkpoint).toEqual(checkpointForStep1)
      // Step 2 has no next call to fill its checkpoint — remains placeholder
      expect(artifact.steps[1].checkpoint.value).toBe('')
    })

    it('stores action type correctly', () => {
      builder.addStep(makeAction({ action: 'input', value: 'John Doe' }), makeElementData(), 1)
      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      expect(artifact.steps[0].actionType).toBe('input')
      // Input values are now templatized; real value stored in inputSchema
      expect(artifact.steps[0].value).toMatch(/^\{\{.+\}\}$/)
      const varName = artifact.steps[0].value!.replace(/^\{\{|\}\}$/g, '')
      expect(artifact.inputSchema[varName].default).toBe('John Doe')
    })

    it('stores element data correctly', () => {
      const elementData = makeElementData()
      builder.addStep(makeAction(), elementData, 1)
      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      expect(artifact.steps[0].elementData.primary.value).toBe('Test Label')
      expect(artifact.steps[0].elementData.fallback.value).toEqual({ x: 100, y: 200 })
    })

    it('step with no value stores undefined', () => {
      builder.addStep(makeAction({ value: null }), makeElementData(), 1)
      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      expect(artifact.steps[0].value).toBeUndefined()
    })

    it('addStep with action=extract stores cssSelector, variableName, and attribute', () => {
      const action = makeAction({
        action:            'extract',
        targetDescription: 'Extract patient name',
        cssSelector:       'td.patient-name',
        variableName:      'patientName',
        attribute:         'data-id',
      })
      builder.addStep(action, makeElementData(), 1)
      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      const step = artifact.steps[0]
      expect(step.actionType).toBe('extract')
      expect(step.cssSelector).toBe('td.patient-name')
      expect(step.variableName).toBe('patientName')
      expect(step.attribute).toBe('data-id')
    })

    it('addStep with action=loop stores loopSelector and innerSteps array', () => {
      const action = makeAction({
        action:            'loop',
        targetDescription: 'Loop over each result row',
        loopSelector:      'tbody tr',
        innerSteps: [
          {
            checkpointForPreviousStep: null,
            action:            'extract',
            targetDescription: 'Extract row text',
            value:             null,
            reasoning:         '',
            requiresLogin:     false,
            goalComplete:      false,
            updatedSummary:    '',
            cssSelector:       'td.name',
            variableName:      'rowName',
          }
        ],
      })
      builder.addStep(action, makeElementData(), 1)
      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      const step = artifact.steps[0]
      expect(step.actionType).toBe('loop')
      expect(step.loopSelector).toBe('tbody tr')
      expect(Array.isArray(step.innerSteps)).toBe(true)
      expect(step.innerSteps).toHaveLength(1)
      expect(step.innerSteps![0].actionType).toBe('extract')
      expect(step.innerSteps![0].cssSelector).toBe('td.name')
      expect(step.innerSteps![0].variableName).toBe('rowName')
    })

    it('addStep with action=output stores outputFormat, outputPath, and outputFields', () => {
      const action = makeAction({
        action:            'output',
        targetDescription: 'Write results to file',
        outputFormat:      'json',
        outputPath:        'results/output.json',
        outputFields: [
          { header: 'Name',   variable: '{{patientName}}' },
          { header: 'Amount', variable: '{{billAmount}}' },
        ],
      })
      builder.addStep(action, makeElementData(), 1)
      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      const step = artifact.steps[0]
      expect(step.actionType).toBe('output')
      expect(step.outputFormat).toBe('json')
      expect(step.outputPath).toBe('results/output.json')
      expect(step.outputFields).toHaveLength(2)
      expect(step.outputFields![0].header).toBe('Name')
      expect(step.outputFields![0].variable).toBe('{{patientName}}')
      expect(step.outputFields![1].header).toBe('Amount')
    })
  })

  describe('build', () => {
    it('applies checkpoint from the final LLM response to the second-to-last step', () => {
      builder.addStep(makeAction({ checkpointForPreviousStep: null }), makeElementData(), 1)

      const checkpointForStep1 = { type: 'text-present' as const, value: 'Success' }
      builder.addStep(
        makeAction({ checkpointForPreviousStep: checkpointForStep1, goalComplete: true }),
        makeElementData(),
        2
      )

      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      expect(artifact.steps[0].checkpoint).toEqual(checkpointForStep1)
    })

    it('returns a valid Artifact with correct metadata', () => {
      builder.addStep(makeAction(), makeElementData(), 1)
      const artifact = builder.build('Search employee', 'https://example.com', 'tenant-001')

      expect(artifact.artifactId).toBeDefined()
      expect(artifact.goal).toBe('Search employee')
      expect(artifact.targetApp).toBe('https://example.com')
      expect(artifact.allowedDomains).toContain('https://example.com')
      expect(artifact.tenantId).toBe('tenant-001')
      expect(artifact.version).toBe(1)
      expect(artifact.allowWrites).toBe(false)
      expect(typeof artifact.createdAt).toBe('string')
    })

    it('returns a unique artifactId on each build call', () => {
      builder.addStep(makeAction(), makeElementData(), 1)
      const a1 = builder.build('goal', 'https://example.com', 'tenant-001')

      const builder2 = new ArtifactBuilder()
      builder2.addStep(makeAction(), makeElementData(), 1)
      const a2 = builder2.build('goal', 'https://example.com', 'tenant-001')

      expect(a1.artifactId).not.toBe(a2.artifactId)
    })

    it('returns all steps in order', () => {
      builder.addStep(makeAction({ targetDescription: 'first' }),  makeElementData(), 1)
      builder.addStep(makeAction({ targetDescription: 'second' }), makeElementData(), 2)
      builder.addStep(makeAction({ targetDescription: 'third' }),  makeElementData(), 3)

      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      expect(artifact.steps).toHaveLength(3)
      expect(artifact.steps[0].description).toBe('first')
      expect(artifact.steps[1].description).toBe('second')
      expect(artifact.steps[2].description).toBe('third')
    })

    it('sets allowWrites=true when artifact contains a top-level output step', () => {
      builder.addStep(makeAction({ action: 'navigate', targetDescription: 'Go to results' }), makeElementData(), 1)
      builder.addStep(
        makeAction({
          action:            'output',
          targetDescription: 'Write results',
          outputFormat:      'json',
          outputPath:        'out.json',
          outputFields:      [],
        }),
        makeElementData(),
        2
      )
      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      expect(artifact.allowWrites).toBe(true)
    })

    it('sets allowWrites=false when no output steps are present', () => {
      builder.addStep(makeAction({ action: 'click', targetDescription: 'Click search' }), makeElementData(), 1)
      builder.addStep(makeAction({ action: 'input', targetDescription: 'Enter name', value: 'Alice' }), makeElementData(), 2)
      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      expect(artifact.allowWrites).toBe(false)
    })

    it('sets allowWrites=true when output step is nested inside a loop step', () => {
      const loopAction = makeAction({
        action:            'loop',
        targetDescription: 'Loop over rows',
        loopSelector:      'tbody tr',
        innerSteps: [
          {
            checkpointForPreviousStep: null,
            action:            'output',
            targetDescription: 'Write row output',
            value:             null,
            reasoning:         '',
            requiresLogin:     false,
            goalComplete:      false,
            updatedSummary:    '',
            outputFormat:      'json',
            outputPath:        'out.json',
            outputFields:      [],
          }
        ],
      })
      builder.addStep(loopAction, makeElementData(), 1)
      const artifact = builder.build('goal', 'https://example.com', 'tenant-001')
      expect(artifact.allowWrites).toBe(true)
    })
  })
})
