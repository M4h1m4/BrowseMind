import { createRunContext, setVar, resolveTemplate } from '../../../src/replay/runContext'

describe('setVar', () => {
  it('sets a string value when outside a loop', () => {
    const ctx = createRunContext()
    setVar(ctx, 'name', 'Alice', false)
    expect(ctx.vars.get('name')).toBe('Alice')
  })

  it('overwrites the value when called again outside a loop', () => {
    const ctx = createRunContext()
    setVar(ctx, 'name', 'Alice', false)
    setVar(ctx, 'name', 'Bob', false)
    expect(ctx.vars.get('name')).toBe('Bob')
  })

  it('creates an array on the first call inside a loop', () => {
    const ctx = createRunContext()
    setVar(ctx, 'item', 'first', true)
    expect(ctx.vars.get('item')).toEqual(['first'])
  })

  it('appends to the array on subsequent calls inside a loop', () => {
    const ctx = createRunContext()
    setVar(ctx, 'item', 'first', true)
    setVar(ctx, 'item', 'second', true)
    setVar(ctx, 'item', 'third', true)
    expect(ctx.vars.get('item')).toEqual(['first', 'second', 'third'])
  })

  it('does not affect other variables when setting one', () => {
    const ctx = createRunContext()
    setVar(ctx, 'a', 'valueA', false)
    setVar(ctx, 'b', 'valueB', false)
    expect(ctx.vars.get('a')).toBe('valueA')
    expect(ctx.vars.get('b')).toBe('valueB')
  })
})

describe('resolveTemplate', () => {
  it('resolves a ctx var that is a plain string', () => {
    const ctx = createRunContext()
    setVar(ctx, 'patientName', 'Jane Doe', false)
    const result = resolveTemplate('Hello {{patientName}}', ctx, {})
    expect(result).toBe('Hello Jane Doe')
  })

  it('resolves a ctx var that is an array by joining with ", "', () => {
    const ctx = createRunContext()
    setVar(ctx, 'items', 'alpha', true)
    setVar(ctx, 'items', 'beta', true)
    setVar(ctx, 'items', 'gamma', true)
    const result = resolveTemplate('Items: {{items}}', ctx, {})
    expect(result).toBe('Items: alpha, beta, gamma')
  })

  it('falls back to inputs when the variable is not in ctx', () => {
    const ctx = createRunContext()
    const result = resolveTemplate('Search: {{query}}', ctx, { query: 'diabetes' })
    expect(result).toBe('Search: diabetes')
  })

  it('returns an empty string for a placeholder with no ctx var and no input', () => {
    const ctx = createRunContext()
    const result = resolveTemplate('Hello {{unknown}}', ctx, {})
    expect(result).toBe('Hello ')
  })

  it('prefers ctx vars over inputs when both are present', () => {
    const ctx = createRunContext()
    setVar(ctx, 'name', 'FromCtx', false)
    const result = resolveTemplate('{{name}}', ctx, { name: 'FromInput' })
    expect(result).toBe('FromCtx')
  })

  it('resolves dotted keys like loop.index', () => {
    const ctx = createRunContext()
    ctx.vars.set('loop.index', '3')
    const result = resolveTemplate('Row {{loop.index}}', ctx, {})
    expect(result).toBe('Row 3')
  })

  it('resolves dotted keys like loop.text', () => {
    const ctx = createRunContext()
    ctx.vars.set('loop.text', 'some text content')
    const result = resolveTemplate('Text: {{loop.text}}', ctx, {})
    expect(result).toBe('Text: some text content')
  })

  it('leaves a template with no placeholders unchanged', () => {
    const ctx = createRunContext()
    const result = resolveTemplate('No placeholders here', ctx, {})
    expect(result).toBe('No placeholders here')
  })

  it('handles an empty template string', () => {
    const ctx = createRunContext()
    const result = resolveTemplate('', ctx, {})
    expect(result).toBe('')
  })

  it('resolves multiple distinct placeholders in a single template', () => {
    const ctx = createRunContext()
    setVar(ctx, 'first', 'John', false)
    setVar(ctx, 'last', 'Smith', false)
    const result = resolveTemplate('{{first}} {{last}}', ctx, {})
    expect(result).toBe('John Smith')
  })

  it('resolves the same placeholder appearing multiple times', () => {
    const ctx = createRunContext()
    setVar(ctx, 'word', 'echo', false)
    const result = resolveTemplate('{{word}} {{word}}', ctx, {})
    expect(result).toBe('echo echo')
  })

  it('resolves a placeholder whose value comes from inputs as a non-string type', () => {
    const ctx = createRunContext()
    const result = resolveTemplate('Count: {{n}}', ctx, { n: 42 })
    expect(result).toBe('Count: 42')
  })
})
