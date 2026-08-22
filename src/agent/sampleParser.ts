/**
 * Multi-sample goal parsing.
 *
 * A goal may carry several data records ("First patient: ... Second patient: ...").
 * Capture only ever uses the FIRST record — the rest are the inputs for replay.
 *
 * Rather than hard-coding a label→variable synonym table, the mapping is derived
 * from the artifact itself: every inputSchema variable's `default` is a value that
 * came from the first record, so matching defaults back to the first record's
 * labels tells us which label feeds which variable. The same labels are then read
 * out of each subsequent record.
 */

import { InputSchema } from '../types'

export interface GoalSample {
  /** Human-readable name for the record, e.g. "Second patient" */
  label: string
  /** The record's text */
  body: string
}

/**
 * Ordinal words that introduce a new record. Numeric forms (2nd, 3rd) are matched
 * separately, so this only needs the words.
 */
const ORDINALS =
  'second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|' +
  'eleventh|twelfth|thirteenth|fourteenth|fifteenth|next|another|final|last'

/**
 * Patterns that introduce a subsequent data record.
 *
 * Deliberately noun-agnostic: what marks a record is the ORDINAL or NUMBER, not
 * the word for the thing. "Second patient:", "Second invoice:", "Third shipment:"
 * and "Second:" are all the same signal, so the noun is matched as arbitrary
 * words rather than from a list. A vocabulary list here would silently degrade to
 * "one record, no replay" on any domain whose noun was missing from it.
 *
 * Kept as one alternation so match positions come back in document order.
 */
const SAMPLE_SEPARATOR = new RegExp(
  [
    // "Second patient:", "Second data entry:", "Next invoice:", "Second:"
    `\\n[ \\t]*(?:${ORDINALS})(?:[ \\t]+[A-Za-z][\\w-]*){0,3}[ \\t]*:`,
    // "2nd patient:", "3rd record:", "2nd:"
    `\\n[ \\t]*\\d+(?:st|nd|rd|th)(?:[ \\t]+[A-Za-z][\\w-]*){0,3}[ \\t]*:`,
    // "Patient #2:", "Record 2:", "Invoice #10:", "#2:"
    `\\n[ \\t]*(?:[A-Za-z][\\w-]*[ \\t]+){0,2}#?[ \\t]*\\d+[ \\t]*:`,
    // "2. " / "2) " numbered list
    `\\n[ \\t]*\\d+[.)][ \\t]`,
    // "---" horizontal rule
    `\\n[ \\t]*-{3,}[ \\t]*\\n`,
  ].join('|'),
  'gi'
)

/**
 * Split records by repeated structure, when no ordinal or numbered marker exists.
 *
 * A goal may simply list records back to back, with nothing but the fields
 * themselves to separate them. The signal is repetition: once the label that
 * opened the first record appears again, a new record has started. This needs no
 * vocabulary at all — it works for patients, invoices or anything else.
 */
function splitByRepeatedStructure(goal: string): GoalSample[] {
  const pattern = /([A-Za-z][A-Za-z0-9 /()'’.\-]*?)\s*:\s*"[^"]*"/g
  const occurrences: { key: string; index: number }[] = []

  let match: RegExpExecArray | null
  while ((match = pattern.exec(goal)) !== null) {
    const rawLabel = match[1].split(/[,\n.]/).pop() ?? match[1]
    const key = normalizeLabel(rawLabel)
    // match.index points at the label, which is where a new record begins.
    if (key) occurrences.push({ key, index: match.index })
  }

  const single = [{ label: 'First record', body: goal.trim() }]
  if (occurrences.length < 2) return single

  const firstKey = occurrences[0].key
  const repeats = occurrences.filter((o, i) => i > 0 && o.key === firstKey)
  if (repeats.length === 0) return single

  // Require the record to have real content, otherwise a goal that merely
  // mentions the same label twice would be torn in half.
  const fieldsPerRecord = occurrences.findIndex((o, i) => i > 0 && o.key === firstKey)
  if (fieldsPerRecord < 2) return single

  const samples: GoalSample[] = [
    { label: 'First record', body: goal.slice(0, repeats[0].index).trim() }
  ]
  for (let i = 0; i < repeats.length; i++) {
    const start = repeats[i].index
    const end   = i + 1 < repeats.length ? repeats[i + 1].index : goal.length
    samples.push({ label: `Record ${i + 2}`, body: goal.slice(start, end).trim() })
  }

  return samples
}

/**
 * Split a goal into its data records.
 *
 * Index 0 is always the first record and keeps any preamble (the instructions
 * that apply to the whole workflow). Later entries are the replay records.
 * A goal with a single record returns an array of length 1.
 */
export function splitGoalSamples(goal: string): GoalSample[] {
  const boundaries: { index: number; marker: string }[] = []

  SAMPLE_SEPARATOR.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SAMPLE_SEPARATOR.exec(goal)) !== null) {
    boundaries.push({ index: match.index, marker: match[0].trim() })
    // A zero-length match would spin forever; separators always consume >0 chars,
    // but guard anyway.
    if (match.index === SAMPLE_SEPARATOR.lastIndex) SAMPLE_SEPARATOR.lastIndex++
  }

  if (boundaries.length === 0) {
    return splitByRepeatedStructure(goal)
  }

  const samples: GoalSample[] = [
    { label: 'First record', body: goal.slice(0, boundaries[0].index).trim() }
  ]

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].index
    const end   = i + 1 < boundaries.length ? boundaries[i + 1].index : goal.length
    const marker = boundaries[i].marker.replace(/[:\-]+$/, '').trim()
    samples.push({
      label: marker || `Record ${i + 2}`,
      body:  goal.slice(start, end).trim()
    })
  }

  return foldPreambleIntoFirstRecord(samples)
}

/**
 * Keep the first record's data in the first sample.
 *
 * When every record is a list item ("1. …", "2. …"), the marker before record ONE
 * also matches, so the leading sample holds only the instructions and no fields.
 * Left alone that is fatal: capture would be handed a goal with no data, and the
 * label→variable mapping — which is read from the first record — would be empty.
 */
function foldPreambleIntoFirstRecord(samples: GoalSample[]): GoalSample[] {
  if (samples.length < 2) return samples
  if (parseSampleFields(samples[0].body).size > 0) return samples
  if (parseSampleFields(samples[1].body).size === 0) return samples

  const [preamble, first, ...rest] = samples
  return [
    { label: 'First record', body: `${preamble.body}\n${first.body}`.trim() },
    ...rest
  ]
}

/**
 * The capture goal: everything up to the second record.
 * Equivalent to `splitGoalSamples(goal)[0].body`, kept as a named helper because
 * that intent ("only show the LLM the first record") is what discovery cares about.
 */
export function extractFirstSampleGoal(goal: string): string {
  return splitGoalSamples(goal)[0].body
}

/** `Label: "value"` pairs found in a record, keyed by normalised label. */
export type SampleFields = Map<string, { label: string; value: string }>

/** Lower-case, strip punctuation and collapse whitespace so labels compare loosely. */
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Pull `Label: "value"` pairs out of one record.
 * Values must be quoted — that is how the goal format distinguishes data from prose.
 */
export function parseSampleFields(sample: string): SampleFields {
  const fields: SampleFields = new Map()
  const pattern = /([A-Za-z][A-Za-z0-9 /()'’.\-]*?)\s*:\s*"([^"]*)"/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(sample)) !== null) {
    // The label may have absorbed a preceding clause ("... to save. Insurance Provider").
    // Keep only the text after the last comma / period / newline.
    const rawLabel = match[1].split(/[,\n.]/).pop() ?? match[1]
    const label = rawLabel.trim()
    if (!label) continue
    const key = normalizeLabel(label)
    if (!key || fields.has(key)) continue
    fields.set(key, { label, value: match[2].trim() })
  }

  return fields
}

/** How a variable's value is recovered from its source label's value. */
export type ExtractMode = 'whole' | 'prefix' | 'suffix'

export interface FieldMapping {
  variable:   string
  /** Normalised label in the record that supplies this variable. */
  labelKey:   string
  /** Human-readable label, for logging. */
  label:      string
  mode:       ExtractMode
  /** For prefix/suffix: how many whitespace-separated words to take. */
  wordCount:  number
}

/** Split camelCase / PascalCase variable names into lower-case words. */
function variableWords(variable: string): string[] {
  return variable
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function words(value: string): string[] {
  return value.split(/\s+/).filter(Boolean)
}

/**
 * Work out which label in the first record feeds each inputSchema variable.
 *
 * Two signals, in order of confidence:
 *   1. Value match — the variable's default IS (or is part of) a labelled value in
 *      the first record. A combined field like
 *      `First Name and Last Name: "William H. Carter"` yields firstName=prefix(2 words)
 *      and lastName=suffix(1 word).
 *   2. Name match — the variable name's words overlap the label's words
 *      (`activeConditionsDiagnoses` ↔ "Active Conditions / Diagnoses").
 */
export function buildFieldMapping(
  firstSample: string,
  inputSchema: InputSchema
): FieldMapping[] {
  const fields   = parseSampleFields(firstSample)
  const mappings: FieldMapping[] = []

  for (const [variable, info] of Object.entries(inputSchema)) {
    const def = (info.default ?? '').trim()

    let best: FieldMapping | null = null

    if (def) {
      for (const [labelKey, field] of fields) {
        const value = field.value
        if (value.toLowerCase() === def.toLowerCase()) {
          best = { variable, labelKey, label: field.label, mode: 'whole', wordCount: 0 }
          break
        }
        // Combined field: the default is one end of a longer value.
        if (value.length > def.length) {
          if (value.toLowerCase().startsWith(def.toLowerCase())) {
            best = {
              variable, labelKey, label: field.label,
              mode: 'prefix', wordCount: words(def).length
            }
            break
          }
          if (value.toLowerCase().endsWith(def.toLowerCase())) {
            best = {
              variable, labelKey, label: field.label,
              mode: 'suffix', wordCount: words(def).length
            }
            break
          }
        }
      }
    }

    // Fall back to matching the variable NAME against the label text.
    if (!best) {
      const varWords = variableWords(variable)
      let bestScore = 0
      for (const [labelKey, field] of fields) {
        const labelWords = labelKey.split(' ').filter(Boolean)
        const overlap = varWords.filter(w => labelWords.includes(w)).length
        // Require a majority of the variable's words to appear in the label.
        if (overlap >= Math.ceil(varWords.length / 2) && overlap > bestScore) {
          bestScore = overlap
          best = { variable, labelKey, label: field.label, mode: 'whole', wordCount: 0 }
        }
      }
    }

    if (best) mappings.push(best)
  }

  return mappings
}

/**
 * Look up a label in a record, tolerating leading filler.
 *
 * The first record often reads "Fill in Gender: ..." while a later one just says
 * "Gender: ...", so the captured label text is not always identical. A match is
 * accepted when one label's words are a subset of the other's — close enough to be
 * the same field, strict enough not to confuse "Emergency Contact Name" with "Name".
 */
function findField(fields: SampleFields, labelKey: string) {
  const exact = fields.get(labelKey)
  if (exact) return exact

  const target = labelKey.split(' ').filter(Boolean)
  let best: { label: string; value: string } | null = null
  let bestScore = 0

  for (const [key, field] of fields) {
    const candidate = key.split(' ').filter(Boolean)
    const overlap = target.filter(w => candidate.includes(w)).length
    const shorter = Math.min(target.length, candidate.length)
    // One label must fully contain the other's words.
    if (overlap === shorter && overlap > bestScore) {
      bestScore = overlap
      best = field
    }
  }

  return best
}

/** Apply a mapping to one record, producing replay inputs. */
export function applyFieldMapping(
  sample: string,
  mapping: FieldMapping[],
  inputSchema: InputSchema
): Record<string, string> {
  const fields = parseSampleFields(sample)
  const inputs: Record<string, string> = {}

  for (const map of mapping) {
    const field = findField(fields, map.labelKey)
    if (!field) continue

    const parts = words(field.value)
    let value: string
    if (map.mode === 'prefix' && map.wordCount > 0 && parts.length > map.wordCount) {
      value = parts.slice(0, map.wordCount).join(' ')
    } else if (map.mode === 'suffix' && map.wordCount > 0 && parts.length > map.wordCount) {
      value = parts.slice(parts.length - map.wordCount).join(' ')
    } else {
      value = field.value
    }
    inputs[map.variable] = value
  }

  // Any variable the record does not mention keeps the captured default, so a
  // partially-specified record still replays.
  for (const [variable, info] of Object.entries(inputSchema)) {
    if (!(variable in inputs) && info.default !== undefined) {
      inputs[variable] = info.default
    }
  }

  return inputs
}

export interface ReplaySample {
  label:  string
  inputs: Record<string, string>
}

/**
 * Turn every record AFTER the first into a ready-to-run set of replay inputs.
 * Returns an empty array when the goal holds only one record.
 */
export function buildReplaySamples(goal: string, inputSchema: InputSchema): ReplaySample[] {
  const samples = splitGoalSamples(goal)
  if (samples.length < 2) return []
  if (Object.keys(inputSchema).length === 0) return []

  const mapping = buildFieldMapping(samples[0].body, inputSchema)
  if (mapping.length === 0) return []

  return samples.slice(1).map(sample => ({
    label:  sample.label,
    inputs: applyFieldMapping(sample.body, mapping, inputSchema)
  }))
}
