import { classifyAction, isAllowedDomain } from '../../../src/replay/guardrails'

describe('classifyAction', () => {
  describe('read-only actions', () => {
    it('classifies wait as read-only', () => {
      expect(classifyAction('wait', 'Wait for page to load')).toBe('read-only')
    })

    it('classifies scroll as read-only', () => {
      expect(classifyAction('scroll', 'Scroll down the employee list')).toBe('read-only')
    })

    it('classifies navigate as read-only', () => {
      expect(classifyAction('navigate', 'Navigate to employee list page')).toBe('read-only')
    })

    it('classifies extract as read-only', () => {
      expect(classifyAction('extract', 'Extract patient name from table row')).toBe('read-only')
    })

    it('classifies loop as read-only', () => {
      expect(classifyAction('loop', 'Loop over each row in the results table')).toBe('read-only')
    })
  })

  describe('write actions', () => {
    it('classifies click as write', () => {
      expect(classifyAction('click', 'Click the Search button')).toBe('write')
    })

    it('classifies input as write', () => {
      expect(classifyAction('input', 'Enter employee name')).toBe('write')
    })

    it('classifies keydown as write', () => {
      expect(classifyAction('keydown', 'Press Enter to submit')).toBe('write')
    })

    it('classifies output as write', () => {
      expect(classifyAction('output', 'Write results to output file')).toBe('write')
    })
  })

  describe('destructive actions', () => {
    it('classifies as destructive when description contains "delete"', () => {
      expect(classifyAction('click', 'Click the Delete employee button')).toBe('destructive')
    })

    it('classifies as destructive when description contains "remove"', () => {
      expect(classifyAction('click', 'Remove this record')).toBe('destructive')
    })

    it('classifies as destructive when description contains "destroy"', () => {
      expect(classifyAction('click', 'Destroy the session')).toBe('destructive')
    })

    it('classifies as destructive when description contains "purge"', () => {
      expect(classifyAction('click', 'Purge old records')).toBe('destructive')
    })

    it('is case-insensitive for destructive keywords', () => {
      expect(classifyAction('click', 'DELETE all employees')).toBe('destructive')
    })

    it('destructive keyword overrides action type — navigate with delete in description', () => {
      expect(classifyAction('navigate', 'Navigate to delete confirmation page')).toBe('destructive')
    })
  })
})

describe('isAllowedDomain', () => {
  it('returns true when url is on the same hostname', () => {
    expect(isAllowedDomain(
      'https://example.com/employees',
      ['https://example.com']
    )).toBe(true)
  })

  it('returns true for a different path on the same hostname', () => {
    expect(isAllowedDomain(
      'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login',
      ['https://opensource-demo.orangehrmlive.com']
    )).toBe(true)
  })

  it('returns false when hostname is not in the allowed list', () => {
    expect(isAllowedDomain(
      'https://evil.com/steal',
      ['https://example.com']
    )).toBe(false)
  })

  it('returns false for a subdomain lookalike attack', () => {
    expect(isAllowedDomain(
      'https://example.com.evil.com',
      ['https://example.com']
    )).toBe(false)
  })

  it('returns true for a genuine subdomain of an allowed host', () => {
    expect(isAllowedDomain(
      'https://api.example.com/data',
      ['https://example.com']
    )).toBe(true)
  })

  it('returns true for a relative URL (treated as same domain)', () => {
    expect(isAllowedDomain('/employees?page=2', ['https://example.com'])).toBe(true)
  })

  it('returns false when domains differ even with same path', () => {
    expect(isAllowedDomain(
      'https://other.com/employees',
      ['https://example.com']
    )).toBe(false)
  })

  it('returns true when url matches the second domain in a multi-domain list', () => {
    expect(isAllowedDomain(
      'https://auth.example.com/login',
      ['https://app.example.com', 'https://auth.example.com']
    )).toBe(true)
  })

  it('returns false when url matches none of the allowed domains', () => {
    expect(isAllowedDomain(
      'https://evil.com/steal',
      ['https://app.example.com', 'https://auth.example.com']
    )).toBe(false)
  })

  it('accepts bare hostnames (without scheme) in the allowed list', () => {
    expect(isAllowedDomain(
      'https://pay.stripe.com/checkout',
      ['https://app.example.com', 'pay.stripe.com']
    )).toBe(true)
  })
})
