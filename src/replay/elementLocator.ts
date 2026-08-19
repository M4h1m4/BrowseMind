import { Page } from 'playwright'
import { ElementData, ElementStrategy } from '../types'

export interface LocateResult {
  strategy:       ElementStrategy
  x:              number
  y:              number
  foundByLocator: boolean   // false when only coordinate fallback was used
}

export async function locateElement(page: Page, elementData: ElementData): Promise<LocateResult> {
  // Each strategy uses a 2-second timeout so we don't wait 30s for elements that don't exist
  const LOCATE_TIMEOUT = 2000

  // Primary: aria-label
  if (elementData.primary.value) {
    try {
      const el  = page.locator(`[aria-label="${elementData.primary.value}"]`).first()
      const box = await el.boundingBox({ timeout: LOCATE_TIMEOUT })
      if (box) return { strategy: 'primary', x: box.x + box.width / 2, y: box.y + box.height / 2, foundByLocator: true }
    } catch { /* not found — fall through */ }
  }

  // Secondary: placeholder
  if (elementData.secondary.value) {
    try {
      const el  = page.locator(`[placeholder="${elementData.secondary.value}"]`).first()
      const box = await el.boundingBox({ timeout: LOCATE_TIMEOUT })
      if (box) return { strategy: 'secondary', x: box.x + box.width / 2, y: box.y + box.height / 2, foundByLocator: true }
    } catch { /* not found — fall through */ }
  }

  // Tertiary: text content
  if (elementData.tertiary.value) {
    try {
      const el  = page.locator(`text=${elementData.tertiary.value}`).first()
      const box = await el.boundingBox({ timeout: LOCATE_TIMEOUT })
      if (box) return { strategy: 'tertiary', x: box.x + box.width / 2, y: box.y + box.height / 2, foundByLocator: true }
    } catch { /* not found — fall through */ }
  }

  // Fallback: stored coordinates (element not found by any named strategy)
  const { x, y } = elementData.fallback.value
  return { strategy: 'fallback', x, y, foundByLocator: false }
}
