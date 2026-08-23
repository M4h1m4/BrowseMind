import { Page } from 'playwright'
import { Checkpoint } from '../types'

/**
 * An empty checkpoint value cannot be checked.
 *
 * It is the placeholder written when a step never received a real checkpoint, and
 * it used to pass silently — `url.includes('')` is always true, so the final
 * submit step of every write workflow verified nothing. Callers should treat this
 * as "unverified", not "verified".
 */
export function isVerifiable(checkpoint: Checkpoint): boolean {
  return checkpoint.value.trim().length > 0
}

export async function verifyCheckpoint(page: Page, checkpoint: Checkpoint): Promise<boolean> {
  if (!isVerifiable(checkpoint)) {
    console.warn('[replay] step has no checkpoint value — nothing to verify')
    return true
  }

  switch (checkpoint.type) {
    case 'url-contains':
      return page.url().includes(checkpoint.value)

    case 'text-present':
      // .first() for the same reason as element-visible below: isVisible() is a
      // strict-mode call and throws when the locator resolves to more than one
      // element. The throw was swallowed by the catch and reported as a failed
      // checkpoint, so any text appearing twice on a page — a heading echoed in
      // the topbar, say — failed every single replay.
      return page.locator(`text=${checkpoint.value}`).first().isVisible().catch(() => false)

    case 'element-visible':
      // Use count() > 0 instead of isVisible() — isVisible() fails on
      // multi-element selectors (e.g. "table tr"), causing false negatives
      return page.locator(checkpoint.value).first().isVisible().catch(() => false)
  }
}
