import { setupTestDb, teardownTestDb } from '../../helpers/db'
import {
  saveArtifact,
  findArtifactById,
  findArtifactsByTenant,
  deleteArtifact,
  generateArtifactId
} from '../../../src/artifact/repository'
import { sampleArtifact } from '../../helpers/fixtures'

beforeEach(() => {
  setupTestDb()
})

afterEach(() => {
  teardownTestDb()
})

describe('saveArtifact', () => {
  it('saves an artifact without throwing', () => {
    expect(() => saveArtifact(sampleArtifact)).not.toThrow()
  })

  it('updates an existing artifact on conflict', () => {
    saveArtifact(sampleArtifact)
    const updated = { ...sampleArtifact, version: 2, goal: 'Updated goal' }
    saveArtifact(updated)

    const result = findArtifactById(sampleArtifact.artifactId, sampleArtifact.tenantId)
    expect(result?.version).toBe(2)
    expect(result?.goal).toBe('Updated goal')
  })
})

describe('findArtifactById', () => {
  it('returns the artifact when it exists', () => {
    saveArtifact(sampleArtifact)
    const result = findArtifactById(sampleArtifact.artifactId, sampleArtifact.tenantId)
    expect(result).not.toBeNull()
    expect(result?.artifactId).toBe(sampleArtifact.artifactId)
    expect(result?.goal).toBe(sampleArtifact.goal)
  })

  it('returns null when artifact does not exist', () => {
    const result = findArtifactById('non-existent', 'tenant-001')
    expect(result).toBeNull()
  })

  it('returns null when tenantId does not match', () => {
    saveArtifact(sampleArtifact)
    const result = findArtifactById(sampleArtifact.artifactId, 'wrong-tenant')
    expect(result).toBeNull()
  })

  it('preserves all steps correctly', () => {
    saveArtifact(sampleArtifact)
    const result = findArtifactById(sampleArtifact.artifactId, sampleArtifact.tenantId)
    expect(result?.steps).toHaveLength(1)
    expect(result?.steps[0].actionType).toBe('click')
    expect(result?.steps[0].elementData.primary.value).toBe('Employee Name')
  })
})

describe('findArtifactsByTenant', () => {
  it('returns empty array when no artifacts exist for tenant', () => {
    const results = findArtifactsByTenant('unknown-tenant')
    expect(results).toEqual([])
  })

  it('returns all artifacts for the given tenant', () => {
    saveArtifact(sampleArtifact)
    saveArtifact({ ...sampleArtifact, artifactId: 'artifact-test-002', goal: 'Another goal' })
    const results = findArtifactsByTenant('tenant-001')
    expect(results).toHaveLength(2)
  })

  it('does not return artifacts from other tenants', () => {
    saveArtifact(sampleArtifact)
    saveArtifact({ ...sampleArtifact, artifactId: 'artifact-other', tenantId: 'tenant-002' })
    const results = findArtifactsByTenant('tenant-001')
    expect(results).toHaveLength(1)
    expect(results[0].tenantId).toBe('tenant-001')
  })
})

describe('deleteArtifact', () => {
  it('returns true when artifact is deleted', () => {
    saveArtifact(sampleArtifact)
    const deleted = deleteArtifact(sampleArtifact.artifactId)
    expect(deleted).toBe(true)
  })

  it('returns false when artifact does not exist', () => {
    const deleted = deleteArtifact('non-existent-id')
    expect(deleted).toBe(false)
  })

  it('removes the artifact from the database', () => {
    saveArtifact(sampleArtifact)
    deleteArtifact(sampleArtifact.artifactId)
    const result = findArtifactById(sampleArtifact.artifactId, sampleArtifact.tenantId)
    expect(result).toBeNull()
  })
})

describe('generateArtifactId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateArtifactId()).toBe('string')
    expect(generateArtifactId().length).toBeGreaterThan(0)
  })

  it('generates unique IDs on each call', () => {
    const id1 = generateArtifactId()
    const id2 = generateArtifactId()
    expect(id1).not.toBe(id2)
  })
})
