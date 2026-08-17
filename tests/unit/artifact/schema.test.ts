import { validateArtifact, validateStep } from '../../../src/artifact/schema'
import { sampleArtifact, sampleStep } from '../../helpers/fixtures'

describe('validateArtifact', () => {
  it('returns true for a valid artifact', () => {
    expect(validateArtifact(sampleArtifact)).toBe(true)
  })

  it('returns false for null', () => {
    expect(validateArtifact(null)).toBe(false)
  })

  it('returns false for a non-object', () => {
    expect(validateArtifact('string')).toBe(false)
  })

  it('returns false when artifactId is missing', () => {
    const { artifactId, ...rest } = sampleArtifact
    expect(validateArtifact(rest)).toBe(false)
  })

  it('returns false when tenantId is missing', () => {
    const { tenantId, ...rest } = sampleArtifact
    expect(validateArtifact(rest)).toBe(false)
  })

  it('returns false when goal is missing', () => {
    const { goal, ...rest } = sampleArtifact
    expect(validateArtifact(rest)).toBe(false)
  })

  it('returns false when version is not a number', () => {
    expect(validateArtifact({ ...sampleArtifact, version: '1' })).toBe(false)
  })

  it('returns false when steps is not an array', () => {
    expect(validateArtifact({ ...sampleArtifact, steps: 'not-an-array' })).toBe(false)
  })
})

describe('validateStep', () => {
  it('returns true for a valid step', () => {
    expect(validateStep(sampleStep)).toBe(true)
  })

  it('returns false for null', () => {
    expect(validateStep(null)).toBe(false)
  })

  it('returns false when stepNumber is missing', () => {
    const { stepNumber, ...rest } = sampleStep
    expect(validateStep(rest)).toBe(false)
  })

  it('returns false when actionType is missing', () => {
    const { actionType, ...rest } = sampleStep
    expect(validateStep(rest)).toBe(false)
  })

  it('returns false when elementData is missing', () => {
    const { elementData, ...rest } = sampleStep
    expect(validateStep(rest)).toBe(false)
  })

  it('returns false when checkpoint is missing', () => {
    const { checkpoint, ...rest } = sampleStep
    expect(validateStep(rest)).toBe(false)
  })
})
