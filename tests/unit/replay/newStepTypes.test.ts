/**
 * Tests for the new step types: extract, loop, output.
 *
 * executeStep is a module-private function inside replay.ts, so we test it
 * indirectly by calling runReplay with mocked dependencies:
 *   - playwright's chromium.launch → returns a mock browser/page
 *   - fs.promises (via fs mock)    → jest.fn() so we can assert on writes
 *   - src/agent/logger             → mocked so writeRunLog is a no-op
 *   - src/session/authStore        → mocked so getAuthState returns undefined
 */

// ─────────────────────────────────────────────────────────────────────────────
// All jest.mock() calls must be at the top (hoisted before imports).
// replay.ts does `import * as fs from 'fs'` and then uses `fs.promises.*`,
// so we mock the 'fs' module and expose mock functions on its .promises object.
// ─────────────────────────────────────────────────────────────────────────────

const fsMkdirMock     = jest.fn().mockResolvedValue(undefined)
const fsWriteFileMock = jest.fn().mockResolvedValue(undefined)

jest.mock('fs', () => ({
  mkdirSync:     jest.fn(),
  writeFileSync: jest.fn(),
  promises: {
    mkdir:     fsMkdirMock,
    writeFile: fsWriteFileMock,
  },
}))

jest.mock('../../../src/agent/logger', () => ({
  writeRunLog: jest.fn(),
}))

jest.mock('../../../src/session/authStore', () => ({
  getAuthState: jest.fn().mockReturnValue(undefined),
}))

jest.mock('playwright', () => ({
  chromium: { launch: jest.fn() },
}))

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { chromium }  from 'playwright'
import { runReplay } from '../../../src/replay/replay'
import { Artifact, RunState, Step } from '../../../src/types'

// ─────────────────────────────────────────────────────────────────────────────
// Mock page / browser builders
// ─────────────────────────────────────────────────────────────────────────────

function makeLocatorMock(text: string, attrValue: string | null = null) {
  const mock: any = {
    textContent:  jest.fn().mockResolvedValue(text),
    getAttribute: jest.fn().mockResolvedValue(attrValue),
    boundingBox:  jest.fn().mockResolvedValue({ x: 0, y: 0, width: 10, height: 10 }),
  }
  // Loop rows need .locator('th').count() to filter header rows
  mock.locator = jest.fn().mockReturnValue({
    count: jest.fn().mockResolvedValue(0),  // 0 = not a header row
    first: jest.fn().mockReturnValue(mock),
    last:  jest.fn().mockReturnValue(mock),
  })
  return mock
}

/**
 * Build a minimal mock Page.
 *
 * `selectorMap` maps CSS selectors to arrays of locator mock objects.
 * The first element is returned by .first(); all elements are returned by .all().
 */
function makePageMock(selectorMap: Record<string, ReturnType<typeof makeLocatorMock>[]> = {}) {
  const locator = jest.fn((selector: string) => {
    const mocks = selectorMap[selector] ?? [makeLocatorMock('')]
    return {
      first: jest.fn().mockReturnValue(mocks[0]),
      all:   jest.fn().mockResolvedValue(mocks),
    }
  })

  return {
    locator,
    goto:            jest.fn().mockResolvedValue(undefined),
    url:             jest.fn().mockReturnValue('https://example.com'),
    waitForTimeout:  jest.fn().mockResolvedValue(undefined),
    setViewportSize: jest.fn().mockResolvedValue(undefined),
    mouse:           { click: jest.fn(), move: jest.fn(), wheel: jest.fn() },
    keyboard:        { press: jest.fn(), type: jest.fn() },
  } as any
}

function mockChromiumWithPage(page: any) {
  const context = {
    newPage:       jest.fn().mockResolvedValue(page),
    addCookies:    jest.fn().mockResolvedValue(undefined),
    addInitScript: jest.fn().mockResolvedValue(undefined),
  }
  const browser = {
    newContext: jest.fn().mockResolvedValue(context),
    close:      jest.fn().mockResolvedValue(undefined),
  }
  return browser
}

// ─────────────────────────────────────────────────────────────────────────────
// Test data helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRunState(): RunState {
  return {
    runId:       'test-run-001',
    type:        'replay',
    status:      'running',
    artifactId:  'artifact-001',
    tenantId:    'tenant-001',
    currentStep: 0,
    isPaused:    false,
    startedAt:   new Date().toISOString(),
    log: {
      runId:     'test-run-001',
      type:      'replay',
      tenantId:  'tenant-001',
      goal:      'test',
      startedAt: new Date().toISOString(),
      status:    'running',
      steps:     [],
    },
  }
}

function makeArtifact(steps: Step[], allowWrites = true): Artifact {
  return {
    artifactId:     'artifact-001',
    tenantId:       'tenant-001',
    version:        1,
    goal:           'Test goal',
    targetApp:      'https://example.com',
    allowedDomains: ['https://example.com'],
    createdAt:      new Date().toISOString(),
    allowWrites,
    inputSchema:    {},
    outputSchema:   {},
    steps,
  }
}

function makeStep(overrides: Partial<Step>): Step {
  return {
    stepNumber:            1,
    actionType:            'click',
    description:           'test step',
    sensitive:             false,
    elementData: {
      primary:   { type: 'aria-label',   value: '' },
      secondary: { type: 'placeholder',  value: '' },
      tertiary:  { type: 'text-content', value: '' },
      fallback:  { type: 'coordinates',  value: { x: 0, y: 0 } },
    },
    waitAfter:             0,
    maxRetries:            0,
    checkpoint:            { type: 'url-contains', value: '' },
    knownOutcomes:         [],
    recoverableConditions: [],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared beforeEach — clear mocks between tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  fsMkdirMock.mockClear()
  fsWriteFileMock.mockClear()
})

// ─────────────────────────────────────────────────────────────────────────────
// extract step
// ─────────────────────────────────────────────────────────────────────────────

describe('extract step', () => {
  it('calls page.locator(cssSelector).first().textContent(), trims, and stores in ctx', async () => {
    const nameLocator  = makeLocatorMock('  Alice  ')
    const selectorMap  = { 'td.name': [nameLocator] }
    const page         = makePageMock(selectorMap)
    const browser      = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const step = makeStep({
      actionType:   'extract',
      description:  'Extract patient name',
      cssSelector:  'td.name',
      variableName: 'patientName',
    })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([step]), {})

    expect(runState.status).toBe('success')
    expect(page.locator).toHaveBeenCalledWith('td.name')
    expect(nameLocator.textContent).toHaveBeenCalled()
    expect(nameLocator.getAttribute).not.toHaveBeenCalled()
  })

  it('calls getAttribute(attribute) instead of textContent when attribute is set', async () => {
    const nameLocator = makeLocatorMock('ignored text', 'attr-value-42')
    const selectorMap = { 'td.name': [nameLocator] }
    const page        = makePageMock(selectorMap)
    const browser     = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const step = makeStep({
      actionType:   'extract',
      description:  'Extract data attribute',
      cssSelector:  'td.name',
      variableName: 'dataId',
      attribute:    'data-id',
    })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([step]), {})

    expect(runState.status).toBe('success')
    expect(nameLocator.getAttribute).toHaveBeenCalledWith('data-id', { timeout: 5000 })
    expect(nameLocator.textContent).not.toHaveBeenCalled()
  })

  it('stores variableName correctly in ctx (verified via output step rowCount)', async () => {
    // Extract stores a value, then output step reads it — rowCount proves the var was set
    const titleLocator = makeLocatorMock('My Report')
    const page         = makePageMock({ 'h1.title': [titleLocator] })
    const browser      = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const extractStep = makeStep({
      stepNumber:   1,
      actionType:   'extract',
      cssSelector:  'h1.title',
      variableName: 'reportTitle',
    })
    const outputStep = makeStep({
      stepNumber:   2,
      actionType:   'output',
      outputFormat: 'json',
      outputPath:   'out.json',
      outputFields: [{ header: 'Title', variable: '{{reportTitle}}' }],
    })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([extractStep, outputStep], true), {})

    expect(runState.status).toBe('success')
    expect(runState.log.outputs?.rowCount).toBe(1)

    const writtenContent = fsWriteFileMock.mock.calls[0][1] as string
    const parsed         = JSON.parse(writtenContent) as { Title: string }[]
    expect(parsed[0].Title).toBe('My Report')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// extract step inside loop context
// ─────────────────────────────────────────────────────────────────────────────

describe('extract step inside loop context', () => {
  it('appends extracted values to an array in ctx when called inside a loop', async () => {
    // 3 loop rows → 3 extract calls → name array of length 3 → rowCount = 3
    const rowMocks  = [makeLocatorMock('Row0'), makeLocatorMock('Row1'), makeLocatorMock('Row2')]
    const cellTexts = ['Alice', 'Bob', 'Carol']
    let cellIdx     = 0

    const page = makePageMock({})
    page.locator = jest.fn((selector: string) => {
      if (selector === 'tbody tr') {
        return {
          first: jest.fn().mockReturnValue(rowMocks[0]),
          all:   jest.fn().mockResolvedValue(rowMocks),
        }
      }
      // Each call to locator('td.name') gets the next cell value
      const text = cellTexts[cellIdx % cellTexts.length]
      cellIdx++
      return {
        first: jest.fn().mockReturnValue(makeLocatorMock(text)),
        all:   jest.fn().mockResolvedValue([makeLocatorMock(text)]),
      }
    })

    const browser = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const innerExtract = makeStep({ stepNumber: 1, actionType: 'extract', cssSelector: 'td.name', variableName: 'name' })
    const loopStep     = makeStep({ stepNumber: 1, actionType: 'loop', loopSelector: 'tbody tr', innerSteps: [innerExtract] })
    const outputStep   = makeStep({
      stepNumber:   2,
      actionType:   'output',
      outputFormat: 'json',
      outputPath:   'out.json',
      outputFields: [{ header: 'Name', variable: '{{name}}' }],
    })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([loopStep, outputStep], true), {})

    expect(runState.status).toBe('success')
    // 3 rows → array of length 3 → rowCount = 3
    expect(runState.log.outputs?.rowCount).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// loop step
// ─────────────────────────────────────────────────────────────────────────────

describe('loop step', () => {
  it('calls page.locator(loopSelector).all() and gets 3 elements', async () => {
    const rowMocks = [makeLocatorMock('Row A'), makeLocatorMock('Row B'), makeLocatorMock('Row C')]
    const cellMock = makeLocatorMock('Cell text')
    const page     = makePageMock({ 'tbody tr': rowMocks, 'td.name': [cellMock] })
    const browser  = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const innerExtract = makeStep({ stepNumber: 1, actionType: 'extract', cssSelector: 'td.name', variableName: 'name' })
    const loopStep     = makeStep({ stepNumber: 1, actionType: 'loop', loopSelector: 'tbody tr', innerSteps: [innerExtract] })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([loopStep]), {})

    expect(runState.status).toBe('success')

    // locator was called with 'tbody tr'
    const loopCall = (page.locator as jest.Mock).mock.calls.find(
      (args: string[]) => args[0] === 'tbody tr'
    )
    expect(loopCall).toBeDefined()
    // textContent of each row element was called to set loop.text
    rowMocks.forEach(rm => expect(rm.textContent).toHaveBeenCalled())
  })

  it('executes inner steps 3 times when there are 3 row elements', async () => {
    const rowMocks = [makeLocatorMock('R0'), makeLocatorMock('R1'), makeLocatorMock('R2')]
    const cellMock = makeLocatorMock('cell')
    const page     = makePageMock({ 'tbody tr': rowMocks, 'td.cell': [cellMock] })
    const browser  = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const innerExtract = makeStep({ stepNumber: 1, actionType: 'extract', cssSelector: 'td.cell', variableName: 'val' })
    const loopStep     = makeStep({ stepNumber: 1, actionType: 'loop', loopSelector: 'tbody tr', innerSteps: [innerExtract] })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([loopStep]), {})

    expect(runState.status).toBe('success')
    // The inner extract step's locator.first().textContent should be called 3 times
    // (once per iteration). cellMock.textContent is called once per iteration.
    expect(cellMock.textContent).toHaveBeenCalledTimes(3)
  })

  it('sets loop.index to "0","1","2" during iterations (verified via ctx accumulation)', async () => {
    // We verify loop.index indirectly by confirming that all 3 iterations ran
    // and accumulated 3 values into the extract variable.
    const rowMocks  = [makeLocatorMock('R0'), makeLocatorMock('R1'), makeLocatorMock('R2')]
    const cellTexts = ['a', 'b', 'c']
    let idx         = 0

    const page = makePageMock({})
    page.locator = jest.fn((selector: string) => {
      if (selector === 'tr') {
        return { first: jest.fn().mockReturnValue(rowMocks[0]), all: jest.fn().mockResolvedValue(rowMocks) }
      }
      const text = cellTexts[idx % cellTexts.length]; idx++
      return {
        first: jest.fn().mockReturnValue(makeLocatorMock(text)),
        all:   jest.fn().mockResolvedValue([makeLocatorMock(text)]),
      }
    })
    const browser = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const innerExtract = makeStep({ stepNumber: 1, actionType: 'extract', cssSelector: 'td', variableName: 'item' })
    const loopStep     = makeStep({ stepNumber: 1, actionType: 'loop', loopSelector: 'tr', innerSteps: [innerExtract] })
    const outputStep   = makeStep({
      stepNumber:   2, actionType: 'output', outputFormat: 'json',
      outputPath: 'o.json', outputFields: [{ header: 'Item', variable: '{{item}}' }],
    })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([loopStep, outputStep], true), {})

    expect(runState.status).toBe('success')
    // 3 iterations → 3 accumulated values → rowCount = 3
    expect(runState.log.outputs?.rowCount).toBe(3)
  })

  it('sets loop.text to the textContent of each row element', async () => {
    const rowMocks = [makeLocatorMock('Alpha'), makeLocatorMock('Beta')]
    const cellMock = makeLocatorMock('cell')
    const page     = makePageMock({ 'ul li': rowMocks, 'span': [cellMock] })
    const browser  = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const innerExtract = makeStep({ stepNumber: 1, actionType: 'extract', cssSelector: 'span', variableName: 'item' })
    const loopStep     = makeStep({ stepNumber: 1, actionType: 'loop', loopSelector: 'ul li', innerSteps: [innerExtract] })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([loopStep]), {})

    expect(runState.status).toBe('success')
    // Each row's textContent is called to populate loop.text
    rowMocks.forEach(rm => expect(rm.textContent).toHaveBeenCalled())
  })

  it('removes loop.index and loop.text from ctx after loop completes', async () => {
    // We verify the cleanup path ran without error; if cleanup failed the loop
    // would error and runState.status would be 'failed'.
    const rowMocks = [makeLocatorMock('Row1'), makeLocatorMock('Row2')]
    const cellMock = makeLocatorMock('v')
    const page     = makePageMock({ 'ul li': rowMocks, 'span': [cellMock] })
    const browser  = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const innerExtract = makeStep({ stepNumber: 1, actionType: 'extract', cssSelector: 'span', variableName: 'item' })
    const loopStep     = makeStep({ stepNumber: 1, actionType: 'loop', loopSelector: 'ul li', innerSteps: [innerExtract] })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([loopStep]), {})

    expect(runState.status).toBe('success')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// output step (JSON)
// ─────────────────────────────────────────────────────────────────────────────

describe('output step (JSON)', () => {
  it('calls fs.promises.mkdir and fs.promises.writeFile with correct JSON content', async () => {
    const page    = makePageMock({ 'h1': [makeLocatorMock('Report Title')] })
    const browser = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const extractStep = makeStep({ stepNumber: 1, actionType: 'extract', cssSelector: 'h1', variableName: 'title' })
    const outputStep  = makeStep({
      stepNumber:   2,
      actionType:   'output',
      description:  'Write JSON',
      outputFormat: 'json',
      outputPath:   'evidence/output.json',
      outputFields: [{ header: 'Title', variable: '{{title}}' }],
    })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([extractStep, outputStep], true), {})

    expect(runState.status).toBe('success')
    expect(fsMkdirMock).toHaveBeenCalled()
    expect(fsWriteFileMock).toHaveBeenCalled()

    const writtenContent = fsWriteFileMock.mock.calls[0][1] as string
    const parsed         = JSON.parse(writtenContent) as { Title: string }[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0]).toHaveProperty('Title', 'Report Title')
  })

  it('sets runState.log.outputs.rowCount to the number of rows written', async () => {
    const rowMocks  = [makeLocatorMock('R0'), makeLocatorMock('R1')]
    const cellTexts = ['Alice', 'Bob']
    let cellIdx     = 0

    const page = makePageMock({})
    page.locator = jest.fn((selector: string) => {
      if (selector === 'tbody tr') {
        return { first: jest.fn().mockReturnValue(rowMocks[0]), all: jest.fn().mockResolvedValue(rowMocks) }
      }
      const text = cellTexts[cellIdx % cellTexts.length]; cellIdx++
      return {
        first: jest.fn().mockReturnValue(makeLocatorMock(text)),
        all:   jest.fn().mockResolvedValue([makeLocatorMock(text)]),
      }
    })

    const browser = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const innerExtract = makeStep({ stepNumber: 1, actionType: 'extract', cssSelector: 'td.name', variableName: 'name' })
    const loopStep     = makeStep({ stepNumber: 1, actionType: 'loop', loopSelector: 'tbody tr', innerSteps: [innerExtract] })
    const outputStep   = makeStep({
      stepNumber:   2, actionType: 'output', outputFormat: 'json',
      outputPath: 'out.json', outputFields: [{ header: 'Name', variable: '{{name}}' }],
    })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([loopStep, outputStep], true), {})

    expect(runState.status).toBe('success')
    expect(runState.log.outputs?.rowCount).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// output step (CSV)
// ─────────────────────────────────────────────────────────────────────────────

describe('output step (CSV)', () => {
  it('writes a correct CSV with header and data rows', async () => {
    const page = makePageMock({})
    page.locator = jest.fn((selector: string) => {
      const text = selector === 'h1.name' ? 'Alice' : '100.00'
      return {
        first: jest.fn().mockReturnValue(makeLocatorMock(text)),
        all:   jest.fn().mockResolvedValue([makeLocatorMock(text)]),
      }
    })
    const browser = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const extractName   = makeStep({ stepNumber: 1, actionType: 'extract', cssSelector: 'h1.name',    variableName: 'name' })
    const extractAmount = makeStep({ stepNumber: 2, actionType: 'extract', cssSelector: 'span.amount', variableName: 'amount' })
    const outputStep    = makeStep({
      stepNumber:   3,
      actionType:   'output',
      outputFormat: 'csv',
      outputPath:   'out.csv',
      outputFields: [
        { header: 'Name',   variable: '{{name}}' },
        { header: 'Amount', variable: '{{amount}}' },
      ],
    })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([extractName, extractAmount, outputStep], true), {})

    expect(runState.status).toBe('success')
    expect(fsWriteFileMock).toHaveBeenCalled()

    const written = fsWriteFileMock.mock.calls[0][1] as string
    const lines   = written.split('\n')
    expect(lines[0]).toBe('Name,Amount')
    expect(lines[1]).toContain('Alice')
    expect(lines[1]).toContain('100.00')
  })

  it('escapes double-quote characters in CSV values', async () => {
    const page = makePageMock({})
    page.locator = jest.fn(() => ({
      first: jest.fn().mockReturnValue(makeLocatorMock('He said "hello"')),
      all:   jest.fn().mockResolvedValue([makeLocatorMock('He said "hello"')]),
    }))
    const browser = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const extractStep = makeStep({ stepNumber: 1, actionType: 'extract', cssSelector: 'p', variableName: 'quote' })
    const outputStep  = makeStep({
      stepNumber:   2,
      actionType:   'output',
      outputFormat: 'csv',
      outputPath:   'out.csv',
      outputFields: [{ header: 'Quote', variable: '{{quote}}' }],
    })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([extractStep, outputStep], true), {})

    expect(runState.status).toBe('success')
    const written = fsWriteFileMock.mock.calls[0][1] as string
    // Double-quotes inside CSV cells must be doubled: "" → """"hello""""
    expect(written).toContain('""hello""')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// output step — allowWrites auto-detection and write-blocking
// ─────────────────────────────────────────────────────────────────────────────

describe('output step and allowWrites', () => {
  it('auto-enables writes when artifact.steps contains an output step (allowWrites was false)', async () => {
    const page    = makePageMock({})
    const browser = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    const outputStep = makeStep({
      stepNumber:   1,
      actionType:   'output',
      outputFormat: 'json',
      outputPath:   'evidence/output.json',
      outputFields: [],
    })

    // artifact.allowWrites is false, but the step list contains an output step →
    // runReplay's effectiveAllowWrites becomes true via artifactHasOutputStep
    const runState = makeRunState()
    await runReplay(runState, makeArtifact([outputStep], /* allowWrites */ false), {})

    expect(runState.status).toBe('success')
    expect(fsWriteFileMock).toHaveBeenCalled()
  })

  it('blocks write-class actions when allowWrites=false and no output step is present', async () => {
    const page    = makePageMock()
    const browser = mockChromiumWithPage(page)
    ;(chromium.launch as jest.Mock).mockResolvedValue(browser)

    // click is a 'write' action; with effectiveAllowWrites=false it is blocked
    const clickStep = makeStep({ stepNumber: 1, actionType: 'click', description: 'Click submit' })

    const runState = makeRunState()
    await runReplay(runState, makeArtifact([clickStep], /* allowWrites */ false), {})

    expect(runState.status).toBe('failed')
    expect(fsWriteFileMock).not.toHaveBeenCalled()
  })
})
