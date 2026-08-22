import { Page } from 'playwright'
import { LLMAction } from '../types'

/**
 * Check if the element at (x, y) is a <select> dropdown.
 * If so, return its CSS selector so we can use selectOption() instead of typing.
 */
async function getSelectInfo(page: Page, x: number, y: number): Promise<{
  isSelect: boolean
  selector: string
  options: { value: string; text: string }[]
} | null> {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return null

    // The element itself or its closest ancestor might be the <select>
    const select = el.tagName.toLowerCase() === 'select'
      ? el as HTMLSelectElement
      : el.closest('select') as HTMLSelectElement | null

    if (!select) return null

    // Build a selector for this select element
    let selector = ''
    if (select.id) {
      selector = '#' + select.id
    } else if (select.name) {
      selector = `select[name="${select.name}"]`
    } else {
      // nth-child fallback
      const parent = select.parentElement
      if (parent) {
        const siblings = Array.from(parent.children)
        const idx = siblings.indexOf(select) + 1
        selector = `select:nth-child(${idx})`
      }
    }

    const options = Array.from(select.options)
      .filter(o => o.value && !o.text.trim().startsWith('—'))
      .map(o => ({ value: o.value, text: o.text.trim() }))

    return { isSelect: true, selector, options }
  }, { x, y })
}

/**
 * For a <select> element, find the best matching option for a given value string.
 * Matches by exact value, exact text, or partial text containment.
 */
function findBestOption(
  options: { value: string; text: string }[],
  targetValue: string
): string | null {
  const target = targetValue.toLowerCase().trim()

  // 1. Exact value match
  const byValue = options.find(o => o.value.toLowerCase() === target)
  if (byValue) return byValue.value

  // 2. Exact text match
  const byText = options.find(o => o.text.toLowerCase() === target)
  if (byText) return byText.value

  // 3. Text contains target or target contains text
  const byContains = options.find(o =>
    o.text.toLowerCase().includes(target) || target.includes(o.text.toLowerCase())
  )
  if (byContains) return byContains.value

  // 4. Keyword overlap
  const targetWords = target.split(/\s+/).filter(w => w.length > 1)
  let bestMatch: { value: string; score: number } | null = null
  for (const opt of options) {
    const optLower = (opt.text + ' ' + opt.value).toLowerCase()
    const score = targetWords.filter(w => optLower.includes(w)).length
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { value: opt.value, score }
    }
  }
  if (bestMatch) return bestMatch.value

  return null
}

export async function executeAction(page: Page, action: LLMAction): Promise<void> {
  switch (action.action) {
    case 'click': {
      if (!action.coordinates) {
        console.warn(`[actions] click without coordinates — target: "${action.targetDescription}"`)
        break
      }
      await page.mouse.click(action.coordinates.x, action.coordinates.y)
      break
    }

    case 'input': {
      if (!action.coordinates) {
        console.warn(`[actions] input without coordinates — target: "${action.targetDescription}"`)
        break
      }

      // Check if the target is a <select> dropdown — needs selectOption, not typing
      const selectInfo = await getSelectInfo(page, action.coordinates.x, action.coordinates.y)
      if (selectInfo && selectInfo.isSelect && selectInfo.selector) {
        const optionValue = findBestOption(selectInfo.options, action.value ?? '')
        if (optionValue) {
          await page.selectOption(selectInfo.selector, optionValue)
          console.log(`[actions] select "${selectInfo.selector}" → "${optionValue}"`)
        } else {
          console.warn(`[actions] no matching option for "${action.value}" in ${selectInfo.selector} — options: ${selectInfo.options.map(o => o.text).join(', ')}`)
        }
        break
      }

      // Check if the target is a date/time input — needs value set via JS, not typing
      const specialInput = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y)
        if (!el) return null
        const input = (el.closest('input') ?? el.querySelector('input')) as HTMLInputElement | null
        if (!input) return null
        const type = (input.type ?? '').toLowerCase()
        if (['date', 'time', 'datetime-local', 'month', 'week'].includes(type)) {
          let selector = ''
          if (input.id) selector = '#' + input.id
          else if (input.name) selector = `input[name="${input.name}"]`
          return { type, selector }
        }
        return null
      }, { x: action.coordinates.x, y: action.coordinates.y })

      if (specialInput && specialInput.selector) {
        // Set value directly via JS for date/time inputs
        await page.evaluate(({ selector, value }) => {
          const input = document.querySelector(selector) as HTMLInputElement
          if (input) {
            input.value = value
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
          }
        }, { selector: specialInput.selector, value: action.value ?? '' })
        console.log(`[actions] set ${specialInput.type} "${specialInput.selector}" → "${action.value}"`)
        break
      }

      await page.mouse.click(action.coordinates.x, action.coordinates.y)
      await page.waitForTimeout(200)
      await page.keyboard.type(action.value ?? '', { delay: 50 })
      break
    }

    case 'navigate': {
      await page.goto(action.value ?? '', { waitUntil: 'domcontentloaded' })
      break
    }

    case 'wait': {
      await page.waitForTimeout(1000)
      break
    }

    case 'scroll': {
      if (!action.coordinates) {
        console.warn(`[actions] scroll without coordinates — using viewport center`)
        await page.mouse.move(640, 360)
      } else {
        await page.mouse.move(action.coordinates.x, action.coordinates.y)
      }
      await page.mouse.wheel(0, 300)
      break
    }

    case 'keydown': {
      await page.keyboard.press(action.value ?? 'Enter')
      break
    }
  }

  await page.waitForTimeout(500)
}
