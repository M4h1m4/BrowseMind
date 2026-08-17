import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/client'
import { Artifact } from '../types'

export function saveArtifact(artifact: Artifact): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO artifacts (artifactId, tenantId, baseArtifactId, version, goal, targetApp, createdAt, content)
    VALUES (@artifactId, @tenantId, @baseArtifactId, @version, @goal, @targetApp, @createdAt, @content)
    ON CONFLICT(artifactId) DO UPDATE SET
      version   = excluded.version,
      content   = excluded.content
  `).run({
    artifactId:     artifact.artifactId,
    tenantId:       artifact.tenantId,
    baseArtifactId: artifact.baseArtifactId ?? null,
    version:        artifact.version,
    goal:           artifact.goal,
    targetApp:      artifact.targetApp,
    createdAt:      artifact.createdAt,
    content:        JSON.stringify(artifact)
  })
}

export function findArtifactById(artifactId: string, tenantId: string): Artifact | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT content FROM artifacts WHERE artifactId = ? AND tenantId = ?'
  ).get(artifactId, tenantId) as { content: string } | undefined

  if (!row) return null
  return JSON.parse(row.content) as Artifact
}

export function findArtifactsByTenant(tenantId: string): Artifact[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT content FROM artifacts WHERE tenantId = ? ORDER BY createdAt DESC'
  ).all(tenantId) as { content: string }[]

  return rows.map(r => JSON.parse(r.content) as Artifact)
}

export function deleteArtifact(artifactId: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM artifacts WHERE artifactId = ?').run(artifactId)
  return result.changes > 0
}

export function generateArtifactId(): string {
  return uuidv4()
}
