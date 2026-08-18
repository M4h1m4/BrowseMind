import { Page, BrowserContext } from 'playwright'
import { storeAuthState } from './authStore'

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
