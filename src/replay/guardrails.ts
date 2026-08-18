import { ActionType } from '../types'

export type ActionClass = 'read-only' | 'write' | 'destructive'

const DESTRUCTIVE_PATTERN = /\b(delete|remove|destroy|wipe|drop|purge|clear all)\b/i

/**
 * Classifies an action as read-only, write, or destructive.
 *
 * - Destructive: target description contains keywords like delete, remove, destroy
 * - Read-only:   wait, scroll, navigate (observing or browsing)
 * - Write:       click, input, keydown (modifying application state)
 */
export function classifyAction(actionType: ActionType, targetDescription: string): ActionClass {
  if (DESTRUCTIVE_PATTERN.test(targetDescription)) return 'destructive'

  switch (actionType) {
    case 'wait':
    case 'scroll':
    case 'navigate':
      return 'read-only'
    case 'click':
    case 'input':
    case 'keydown':
      return 'write'
  }
}

/**
 * Returns true if the given URL is on the same hostname as targetApp.
 * Relative URLs (no hostname) are considered safe — same domain by definition.
 */
export function isAllowedDomain(url: string, targetApp: string): boolean {
  try {
    const allowedHost = new URL(targetApp).hostname
    const currentHost = new URL(url).hostname
    return currentHost === allowedHost || currentHost.endsWith(`.${allowedHost}`)
  } catch {
    // Relative URL or unparseable — treat as same-domain
    return true
  }
}
