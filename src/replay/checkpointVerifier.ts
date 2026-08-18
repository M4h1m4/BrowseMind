import { Page } from 'playwright'
import { Checkpoint } from '../types'

export async function verifyCheckpoint(page: Page, checkpoint: Checkpoint): Promise<boolean> {
  switch (checkpoint.type) {
    case 'url-contains':
      return page.url().includes(checkpoint.value)

    case 'text-present':
      return page.locator(`text=${checkpoint.value}`).isVisible().catch(() => false)

    case 'element-visible':
      return page.locator(checkpoint.value).isVisible().catch(() => false)
  }
}
