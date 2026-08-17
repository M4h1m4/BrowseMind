import { Artifact, Step } from '../types'

export function validateArtifact(artifact: unknown): artifact is Artifact {
  if (!artifact || typeof artifact !== 'object') return false
  const a = artifact as Record<string, unknown>

  if (typeof a.artifactId !== 'string') return false
  if (typeof a.tenantId !== 'string') return false
  if (typeof a.version !== 'number') return false
  if (typeof a.goal !== 'string') return false
  if (typeof a.targetApp !== 'string') return false
  if (typeof a.createdAt !== 'string') return false
  if (!Array.isArray(a.steps)) return false

  return true
}

export function validateStep(step: unknown): step is Step {
  if (!step || typeof step !== 'object') return false
  const s = step as Record<string, unknown>

  if (typeof s.stepNumber !== 'number') return false
  if (typeof s.actionType !== 'string') return false
  if (typeof s.description !== 'string') return false
  if (!s.elementData || typeof s.elementData !== 'object') return false
  if (!s.checkpoint || typeof s.checkpoint !== 'object') return false

  return true
}
