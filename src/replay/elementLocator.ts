import { Page } from 'playwright'
import { ElementData, ElementStrategy } from '../types'

export interface LocateResult {
  strategy: ElementStrategy
  x: number
  y: number
}

export async function locateElement(page: Page, elementData: ElementData): Promise<LocateResult> {
  // Primary: aria-label
  if (elementData.primary.value) {
    try {
      const el  = page.locator(`[aria-label="${elementData.primary.value}"]`).first()
      const box = await el.boundingBox()
      if (box) return { strategy: 'primary', x: box.x + box.width / 2, y: box.y + box.height / 2 }
    } catch { /* not found — fall through */ }
  }

  // Secondary: placeholder
  if (elementData.secondary.value) {
    try {
      const el  = page.locator(`[placeholder="${elementData.secondary.value}"]`).first()
      const box = await el.boundingBox()
      if (box) return { strategy: 'secondary', x: box.x + box.width / 2, y: box.y + box.height / 2 }
    } catch { /* not found — fall through */ }
  }

  // Tertiary: text content
  if (elementData.tertiary.value) {
    try {
      const el  = page.locator(`text=${elementData.tertiary.value}`).first()
      const box = await el.boundingBox()
      if (box) return { strategy: 'tertiary', x: box.x + box.width / 2, y: box.y + box.height / 2 }
    } catch { /* not found — fall through */ }
  }

  // Fallback: stored coordinates
  const { x, y } = elementData.fallback.value
  return { strategy: 'fallback', x, y }
}
