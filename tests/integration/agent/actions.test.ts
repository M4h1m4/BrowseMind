import { Page } from 'playwright'
import { executeAction } from '../../../src/agent/actions'
import { LLMAction } from '../../../src/types'

function makeMockPage(): Page {
  return {
    mouse: {
      click:  jest.fn().mockResolvedValue(undefined),
      move:   jest.fn().mockResolvedValue(undefined),
      wheel:  jest.fn().mockResolvedValue(undefined)
    },
    keyboard: {
      type:  jest.fn().mockResolvedValue(undefined),
      press: jest.fn().mockResolvedValue(undefined)
    },
    goto:           jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    evaluate:       jest.fn().mockResolvedValue(null),
    selectOption:   jest.fn().mockResolvedValue(undefined)
  } as unknown as Page
}

const baseAction: LLMAction = {
  checkpointForPreviousStep: null,
  action:            'click',
  coordinates:       { x: 100, y: 200 },
  targetDescription: 'Submit button',
  value:             null,
  reasoning:         'Click to submit',
  requiresLogin:     false,
  goalComplete:      false,
  updatedSummary:    'clicked submit'
}

describe('executeAction', () => {
  it('click — calls page.mouse.click with coordinates', async () => {
    const page = makeMockPage()
    await executeAction(page, { ...baseAction, action: 'click', coordinates: { x: 150, y: 250 } })
    expect(page.mouse.click).toHaveBeenCalledWith(150, 250)
  })

  it('click — skips click when coordinates not provided (no hardcoded fallback)', async () => {
    const page = makeMockPage()
    const action = { ...baseAction, action: 'click' as const, coordinates: undefined }
    await executeAction(page, action)
    expect(page.mouse.click).not.toHaveBeenCalled()
  })

  it('input — clicks target then types value', async () => {
    const page = makeMockPage()
    await executeAction(page, {
      ...baseAction,
      action:      'input',
      coordinates: { x: 300, y: 100 },
      value:       'John Doe'
    })
    expect(page.mouse.click).toHaveBeenCalledWith(300, 100)
    expect(page.keyboard.type).toHaveBeenCalledWith('John Doe', { delay: 50 })
  })

  it('navigate — calls page.goto with value as URL', async () => {
    const page = makeMockPage()
    await executeAction(page, {
      ...baseAction,
      action: 'navigate',
      value:  'https://example.com'
    })
    expect(page.goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'domcontentloaded' })
  })

  it('wait — calls page.waitForTimeout', async () => {
    const page = makeMockPage()
    await executeAction(page, { ...baseAction, action: 'wait' })
    expect(page.waitForTimeout).toHaveBeenCalledWith(1000)
  })

  it('scroll — moves mouse to coordinates then scrolls down', async () => {
    const page = makeMockPage()
    await executeAction(page, {
      ...baseAction,
      action:      'scroll',
      coordinates: { x: 640, y: 400 }
    })
    expect(page.mouse.move).toHaveBeenCalledWith(640, 400)
    expect(page.mouse.wheel).toHaveBeenCalledWith(0, 300)
  })

  it('keydown — calls page.keyboard.press with value', async () => {
    const page = makeMockPage()
    await executeAction(page, { ...baseAction, action: 'keydown', value: 'Enter' })
    expect(page.keyboard.press).toHaveBeenCalledWith('Enter')
  })

  it('keydown — uses Enter as default when value is null', async () => {
    const page = makeMockPage()
    await executeAction(page, { ...baseAction, action: 'keydown', value: null })
    expect(page.keyboard.press).toHaveBeenCalledWith('Enter')
  })

  it('every action calls waitForTimeout at the end to let the page settle', async () => {
    const page = makeMockPage()
    await executeAction(page, { ...baseAction, action: 'click' })
    expect(page.waitForTimeout).toHaveBeenLastCalledWith(500)
  })
})
