import { Page, BrowserContext } from 'playwright'
import { LoginCredentials } from './resumeSignal'
import { storeAuthState } from './authStore'

/**
 * Attempt to log in using the supplied credentials.
 *
 * Strategy (most apps share this pattern):
 *   1. Find username/email field by common aria-labels / placeholders
 *   2. Find password field
 *   3. Fill both and submit
 *
 * If the selectors miss the mark the run will surface a checkpoint failure on
 * the next step — the user can then take over via the takeover endpoint.
 */
export async function performLogin(
  page: Page,
  creds: LoginCredentials
): Promise<void> {
  const usernameSelectors = [
    '[aria-label*="username" i]',
    '[aria-label*="email" i]',
    '[placeholder*="username" i]',
    '[placeholder*="email" i]',
    'input[type="text"]',
    'input[name="username"]',
    'input[name="email"]'
  ]

  const passwordSelectors = [
    '[aria-label*="password" i]',
    '[placeholder*="password" i]',
    'input[type="password"]',
    'input[name="password"]'
  ]

  // Fill username
  for (const selector of usernameSelectors) {
    try {
      const el = page.locator(selector).first()
      if (await el.isVisible({ timeout: 1000 })) {
        await el.click()
        await el.fill(creds.username)
        break
      }
    } catch { /* try next */ }
  }

  // Fill password
  for (const selector of passwordSelectors) {
    try {
      const el = page.locator(selector).first()
      if (await el.isVisible({ timeout: 1000 })) {
        await el.click()
        await el.fill(creds.password)
        break
      }
    } catch { /* try next */ }
  }

  // Submit — press Enter (works for most login forms)
  await page.keyboard.press('Enter')

  // Give the SPA time to process the login
  await page.waitForTimeout(2000)

  console.log('[loginHandler] credentials submitted')
}

/**
 * Capture cookies and localStorage from the current page and store them
 * in the in-memory auth store, keyed by the target app's hostname.
 *
 * Called once immediately after a successful login so that all future
 * replay runs on the same domain can skip the login step entirely.
 */
export async function captureAndStoreAuthState(
  context: BrowserContext,
  page: Page,
  targetApp: string
): Promise<void> {
  const domain = new URL(targetApp).hostname

  const cookies = await context.cookies()

  const localStorageData = await page.evaluate<Record<string, string>>(() => {
    const result: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) result[key] = localStorage.getItem(key) ?? ''
    }
    return result
  })

  storeAuthState(domain, {
    domain,
    cookies,
    localStorage: localStorageData,
    capturedAt:   new Date().toISOString()
  })

  console.log(
    `[loginHandler] auth state captured for ${domain} — ` +
    `${cookies.length} cookies, ${Object.keys(localStorageData).length} localStorage keys`
  )
}
