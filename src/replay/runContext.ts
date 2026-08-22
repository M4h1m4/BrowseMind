export interface RunContext {
  vars: Map<string, string | string[]>
}

export function createRunContext(): RunContext {
  return { vars: new Map() }
}

export function setVar(ctx: RunContext, name: string, value: string, insideLoop: boolean): void {
  if (insideLoop) {
    const existing = ctx.vars.get(name)
    if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      ctx.vars.set(name, [value])
    }
  } else {
    ctx.vars.set(name, value)
  }
}

export function resolveTemplate(
  template: string,
  ctx: RunContext,
  inputs: Record<string, unknown>,
  inputSchema?: Record<string, { type: string; default?: string }>
): string {
  if (!template) return template
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    // 1. Check runtime context (loop variables, extracted values)
    const ctxVal = ctx.vars.get(key)
    if (ctxVal !== undefined) {
      return Array.isArray(ctxVal) ? ctxVal.join(', ') : ctxVal
    }
    // 2. Check user-provided inputs (replay with new data)
    const inputVal = inputs[key]
    if (inputVal !== undefined) return String(inputVal)
    // 3. Fall back to inputSchema defaults (replay with capture data)
    if (inputSchema && inputSchema[key]?.default !== undefined) {
      return inputSchema[key].default!
    }
    return ''
  })
}
