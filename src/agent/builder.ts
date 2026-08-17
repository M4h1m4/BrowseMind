import { Artifact, Step, LLMAction, ElementData } from '../types'
import { generateArtifactId } from '../artifact/repository'

export class ArtifactBuilder {
  private steps: Step[] = []

  addStep(action: LLMAction, elementData: ElementData, stepNumber: number): void {
    // The checkpoint in this LLM response proves the PREVIOUS step succeeded.
    // Apply it to the previous step before pushing the new one.
    if (action.checkpointForPreviousStep !== null && this.steps.length > 0) {
      this.steps[this.steps.length - 1].checkpoint = action.checkpointForPreviousStep
    }

    const step: Step = {
      stepNumber,
      actionType:            action.action,
      description:           action.targetDescription,
      value:                 action.value ?? undefined,
      sensitive:             false,
      elementData,
      waitAfter:             500,
      maxRetries:            3,
      checkpoint:            { type: 'url-contains', value: '' }, // filled by next addStep call
      knownOutcomes:         [],
      recoverableConditions: []
    }

    this.steps.push(step)
  }

  build(goal: string, targetApp: string, tenantId: string): Artifact {
    return {
      artifactId:   generateArtifactId(),
      tenantId,
      version:      1,
      goal,
      targetApp,
      createdAt:    new Date().toISOString(),
      allowWrites:  false,
      inputSchema:  {},
      outputSchema: {},
      steps:        this.steps
    }
  }

  getStepCount(): number {
    return this.steps.length
  }
}
