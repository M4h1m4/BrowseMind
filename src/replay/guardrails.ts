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
    case 'extract':
    case 'loop':
      return 'read-only'
    case 'click':
    case 'input':
    case 'keydown':
      return 'write'
    case 'output':
      return 'write'
  }
}

/**
 * Returns true if the given URL is on one of the allowedDomains hostnames
 * (or a subdomain of one). Relative URLs are treated as same-domain (safe).
 *
 * allowedDomains is an array of full URLs or bare hostnames, e.g.:
 *   ['https://app.example.com', 'https://auth.example.com']
 */
export function isAllowedDomain(url: string, allowedDomains: string[]): boolean {
  let currentHostname: string
  let currentHost: string   // hostname + port — distinguishes localhost:3001 from localhost:3002
  try {
    const parsed  = new URL(url)
    currentHostname = parsed.hostname
    currentHost     = parsed.host
  } catch {
    // Relative URL — treat as same-domain
    return true
  }

  return allowedDomains.some(domain => {
    try {
      // domain may be a full URL (http://example.com) or a bare hostname (example.com)
      const parsed      = domain.includes('://')
        ? new URL(domain)
        : new URL(`http://${domain}`)
      const allowedHost     = parsed.host      // with port
      const allowedHostname = parsed.hostname  // without port, used for subdomain check

      // Exact host match (respects port)
      if (currentHost === allowedHost) return true
      // Subdomain of allowed hostname (no-port check — subdomains share the parent's port rules)
      if (currentHostname.endsWith(`.${allowedHostname}`)) return true
      return false
    } catch {
      return false
    }
  })
}
