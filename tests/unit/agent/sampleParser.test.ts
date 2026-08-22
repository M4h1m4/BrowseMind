import {
  splitGoalSamples,
  extractFirstSampleGoal,
  parseSampleFields,
  buildFieldMapping,
  buildReplaySamples
} from '../../../src/agent/sampleParser'
import { InputSchema } from '../../../src/types'

const TWO_PATIENT_GOAL = `Go to the patients tab and click on add patient. Fill in the following details: First Name and Last Name: "William H. Carter", Date of Birth: "1983-06-14", Gender: "Male", SSN last 4 digits: "4821", Blood Type: "O-", Insurance Provider: "Cigna". After entering all the details, click on register patient to save the record.

Second patient:

First Name and Last Name: "Elena R. Vasquez", Date of Birth: "1975-11-28", Gender: "Female", SSN last 4 digits: "7934", Blood Type: "A+", Insurance Provider: "Blue Cross".`

const SCHEMA: InputSchema = {
  firstName:         { type: 'string', default: 'William H.' },
  lastName:          { type: 'string', default: 'Carter' },
  dateOfBirth:       { type: 'string', default: '1983-06-14' },
  gender:            { type: 'string', default: 'Male' },
  ssnLast4:          { type: 'string', default: '4821', sensitive: true },
  bloodType:         { type: 'string', default: 'O-' },
  insuranceProvider: { type: 'string', default: 'Cigna' }
}

describe('splitGoalSamples', () => {
  it('splits a two-record goal and keeps the preamble with the first record', () => {
    const samples = splitGoalSamples(TWO_PATIENT_GOAL)
    expect(samples).toHaveLength(2)
    expect(samples[0].body).toContain('Go to the patients tab')
    expect(samples[0].body).toContain('William H. Carter')
    expect(samples[0].body).not.toContain('Elena')
    expect(samples[1].label).toBe('Second patient')
    expect(samples[1].body).toContain('Elena R. Vasquez')
  })

  it('returns a single sample when the goal holds one record', () => {
    const samples = splitGoalSamples('Add a patient named "Ann Lee" with Gender: "Female".')
    expect(samples).toHaveLength(1)
  })

  it('handles three records introduced by ordinals', () => {
    const goal = 'First: "a"\nSecond record:\nx: "b"\nThird record:\ny: "c"'
    expect(splitGoalSamples(goal).map(s => s.label))
      .toEqual(['First record', 'Second record', 'Third record'])
  })

  it('handles numbered and rule-separated records', () => {
    expect(splitGoalSamples('do it\n2. next one').length).toBe(2)
    expect(splitGoalSamples('do it\n---\nnext one').length).toBe(2)
  })
})

describe('extractFirstSampleGoal', () => {
  it('strips every record after the first', () => {
    const first = extractFirstSampleGoal(TWO_PATIENT_GOAL)
    expect(first).toContain('William H. Carter')
    expect(first).not.toContain('Elena R. Vasquez')
    expect(first).not.toContain('Second patient')
  })

  it('leaves a single-record goal untouched', () => {
    const goal = 'Search for "laptops" and save the results.'
    expect(extractFirstSampleGoal(goal)).toBe(goal)
  })
})

describe('parseSampleFields', () => {
  it('reads quoted label/value pairs', () => {
    const fields = parseSampleFields('Gender: "Male", Blood Type: "O-"')
    expect(fields.get('gender')?.value).toBe('Male')
    expect(fields.get('blood type')?.value).toBe('O-')
  })

  it('does not let a preceding clause bleed into the label', () => {
    const fields = parseSampleFields('click save. Insurance Provider: "Cigna"')
    expect(fields.has('insurance provider')).toBe(true)
  })
})

describe('buildFieldMapping', () => {
  const first = splitGoalSamples(TWO_PATIENT_GOAL)[0].body

  it('maps each schema variable to the label that supplied its default', () => {
    const mapping = buildFieldMapping(first, SCHEMA)
    const byVar = Object.fromEntries(mapping.map(m => [m.variable, m]))
    expect(byVar.gender.labelKey).toBe('gender')
    expect(byVar.bloodType.labelKey).toBe('blood type')
    expect(byVar.insuranceProvider.labelKey).toBe('insurance provider')
  })

  it('splits a combined name field into prefix and suffix', () => {
    const byVar = Object.fromEntries(buildFieldMapping(first, SCHEMA).map(m => [m.variable, m]))
    expect(byVar.firstName.mode).toBe('prefix')
    expect(byVar.firstName.wordCount).toBe(2)   // "William H."
    expect(byVar.lastName.mode).toBe('suffix')
    expect(byVar.lastName.wordCount).toBe(1)    // "Carter"
  })

  it('falls back to variable-name matching when no default matches', () => {
    const schema: InputSchema = { bloodType: { type: 'string', default: 'not-in-goal' } }
    const mapping = buildFieldMapping(first, schema)
    expect(mapping[0].labelKey).toBe('blood type')
  })
})

describe('buildReplaySamples', () => {
  it('turns the second record into replay inputs', () => {
    const samples = buildReplaySamples(TWO_PATIENT_GOAL, SCHEMA)
    expect(samples).toHaveLength(1)
    expect(samples[0].label).toBe('Second patient')
    expect(samples[0].inputs).toEqual({
      firstName:         'Elena R.',
      lastName:          'Vasquez',
      dateOfBirth:       '1975-11-28',
      gender:            'Female',
      ssnLast4:          '7934',
      bloodType:         'A+',
      insuranceProvider: 'Blue Cross'
    })
  })

  it('returns nothing for a single-record goal', () => {
    expect(buildReplaySamples('Add "Ann Lee" as Gender: "Female".', SCHEMA)).toEqual([])
  })

  it('returns nothing when the artifact has no input variables', () => {
    expect(buildReplaySamples(TWO_PATIENT_GOAL, {})).toEqual([])
  })

  it('keeps the captured default for a field the later record omits', () => {
    const goal = `Add First Name and Last Name: "William H. Carter", Gender: "Male", Blood Type: "O-".

Second patient:
First Name and Last Name: "Elena R. Vasquez", Gender: "Female".`
    const schema: InputSchema = {
      firstName: { type: 'string', default: 'William H.' },
      lastName:  { type: 'string', default: 'Carter' },
      gender:    { type: 'string', default: 'Male' },
      bloodType: { type: 'string', default: 'O-' }
    }
    const inputs = buildReplaySamples(goal, schema)[0].inputs
    expect(inputs.firstName).toBe('Elena R.')
    expect(inputs.gender).toBe('Female')
    expect(inputs.bloodType).toBe('O-')   // untouched by the second record
  })

  it('produces one input set per record for a three-record goal', () => {
    const goal = `Add Gender: "Male".

Second patient:
Gender: "Female".

Third patient:
Gender: "Male".`
    const samples = buildReplaySamples(goal, { gender: { type: 'string', default: 'Male' } })
    expect(samples.map(s => s.label)).toEqual(['Second patient', 'Third patient'])
    expect(samples[0].inputs.gender).toBe('Female')
  })

  it('does not mistake sensitive values for a different field', () => {
    const samples = buildReplaySamples(TWO_PATIENT_GOAL, SCHEMA)
    expect(samples[0].inputs.ssnLast4).toBe('7934')
  })
})

/**
 * Record detection must not depend on domain vocabulary. A noun list would
 * silently degrade to "one record, no replay" for any domain it omitted.
 */
describe('domain-independent record detection', () => {
  const schema: InputSchema = {
    reference: { type: 'string', default: 'INV-001' },
    amount:    { type: 'string', default: '250.00' }
  }

  const goalFor = (marker: string) =>
    `Create an invoice. Reference: "INV-001", Amount: "250.00".\n${marker}\nReference: "INV-002", Amount: "980.00".`

  it.each([
    ['Second invoice:'],
    ['Second shipment:'],
    ['Second purchase order:'],
    ['Next invoice:'],
    ['2nd invoice:'],
    ['Invoice #2:'],
    ['Another one:'],
    ['Second:'],
  ])('splits on "%s"', (marker) => {
    const samples = splitGoalSamples(goalFor(marker))
    expect(samples).toHaveLength(2)
    expect(samples[1].body).toContain('INV-002')
    expect(samples[0].body).not.toContain('INV-002')
  })

  it('maps a non-patient domain to replay inputs', () => {
    const replays = buildReplaySamples(goalFor('Second invoice:'), schema)
    expect(replays).toHaveLength(1)
    expect(replays[0].inputs).toEqual({ reference: 'INV-002', amount: '980.00' })
  })

  it('handles many records of an arbitrary noun', () => {
    const goal = [
      'Add a shipment. Tracking: "A1", Carrier: "DHL".',
      'Second shipment:\nTracking: "B2", Carrier: "UPS".',
      'Third shipment:\nTracking: "C3", Carrier: "FedEx".',
      'Fourth shipment:\nTracking: "D4", Carrier: "USPS".'
    ].join('\n')
    const samples = splitGoalSamples(goal)
    expect(samples).toHaveLength(4)

    const replays = buildReplaySamples(goal, {
      tracking: { type: 'string', default: 'A1' },
      carrier:  { type: 'string', default: 'DHL' }
    })
    expect(replays.map(r => r.inputs.tracking)).toEqual(['B2', 'C3', 'D4'])
  })

  it('splits on repeated structure when there is no marker at all', () => {
    const goal =
      'Register these people. Full Name: "Ana Ruiz", Email: "ana@x.com", City: "Lisbon". ' +
      'Full Name: "Tom Byrne", Email: "tom@x.com", City: "Cork".'
    const samples = splitGoalSamples(goal)
    expect(samples).toHaveLength(2)
    expect(samples[1].body).toContain('Tom Byrne')
  })

  it('does not tear a single record apart', () => {
    const goal = 'Add Full Name: "Ana Ruiz", Email: "ana@x.com", City: "Lisbon".'
    expect(splitGoalSamples(goal)).toHaveLength(1)
  })
})

/**
 * Records given as a list, with no "Second …" wording. The marker before record
 * ONE also matches, so without folding the leading sample holds only the
 * instructions — capture would receive a goal with no data at all.
 */
describe('records given as a list', () => {
  const schema: InputSchema = {
    productName: { type: 'string', default: 'Cable Tester' },
    sku:         { type: 'string', default: 'TL-4471' }
  }

  const listGoal = (bullet: (n: number) => string) =>
    ['Add these products to the catalog.',
     `${bullet(1)} Product Name: "Cable Tester", SKU: "TL-4471"`,
     `${bullet(2)} Product Name: "Task Chair", SKU: "FN-2208"`,
     `${bullet(3)} Product Name: "Label Printer", SKU: "OF-9930"`].join('\n')

  it.each([
    ['numbered "1."', (n: number) => `${n}.`],
    ['numbered "1)"', (n: number) => `${n})`],
    ['dash bullets',  () => '-'],
    ['asterisks',     () => '*'],
  ])('splits %s into three records', (_label, bullet) => {
    const goal = listGoal(bullet as (n: number) => string)
    const samples = splitGoalSamples(goal)
    expect(samples).toHaveLength(3)
    // The first record must carry its own data, not just the preamble.
    expect(samples[0].body).toContain('Cable Tester')
    expect(samples[0].body).not.toContain('Task Chair')
  })

  it.each([
    ['numbered "1."', (n: number) => `${n}.`],
    ['numbered "1)"', (n: number) => `${n})`],
    ['dash bullets',  () => '-'],
  ])('produces two replay records for %s', (_label, bullet) => {
    const goal = listGoal(bullet as (n: number) => string)
    const replays = buildReplaySamples(goal, schema)
    expect(replays.map(r => r.inputs.sku)).toEqual(['FN-2208', 'OF-9930'])
    expect(replays.map(r => r.inputs.productName)).toEqual(['Task Chair', 'Label Printer'])
  })

  it('gives capture only the first list item', () => {
    const goal = listGoal((n: number) => `${n}.`)
    const captureGoal = extractFirstSampleGoal(goal)
    expect(captureGoal).toContain('Add these products to the catalog.')
    expect(captureGoal).toContain('TL-4471')
    expect(captureGoal).not.toContain('FN-2208')
    expect(captureGoal).not.toContain('OF-9930')
  })
})
