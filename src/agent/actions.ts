import { Page } from 'playwright'
import { LLMAction } from '../types'

export async function executeAction(page: Page, action: LLMAction): Promise<void> {
  switch (action.action) {
    case 'click': {
      const { x, y } = action.coordinates ?? { x: 640, y: 360 }
      await page.mouse.click(x, y)
      break
    }

    case 'input': {
      const { x, y } = action.coordinates ?? { x: 640, y: 360 }
      await page.mouse.click(x, y)
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
      const { x, y } = action.coordinates ?? { x: 640, y: 360 }
      await page.mouse.move(x, y)
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
