import { Page } from 'playwright'
import { ElementData } from '../types'

export async function extractElementData(
  page: Page,
  x: number,
  y: number
): Promise<ElementData> {
  const attrs = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      if (!el) return null

      // Try to find an associated label via for= attribute
      const labelEl = el.id
        ? document.querySelector<HTMLElement>(`label[for="${el.id}"]`)
        : null

      const ariaLabel =
        el.getAttribute('aria-label') ??
        el.getAttribute('aria-labelledby') ??
        labelEl?.textContent?.trim() ??
        ''

      return {
        ariaLabel,
        placeholder: (el as HTMLInputElement).placeholder ?? '',
        textContent: el.textContent?.trim().slice(0, 100) ?? ''
      }
    },
    { x, y }
  )

  return {
    primary:   { type: 'aria-label',   value: attrs?.ariaLabel   ?? '' },
    secondary: { type: 'placeholder',  value: attrs?.placeholder ?? '' },
    tertiary:  { type: 'text-content', value: attrs?.textContent ?? '' },
    fallback:  { type: 'coordinates',  value: { x, y } }
  }
}
