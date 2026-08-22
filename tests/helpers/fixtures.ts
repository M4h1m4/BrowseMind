import { Artifact, Step } from '../../src/types'

export const sampleStep: Step = {
  stepNumber:  1,
  actionType:  'click',
  description: 'Click the Employee Name search field',
  sensitive:   false,
  elementData: {
    primary:   { type: 'aria-label',   value: 'Employee Name' },
    secondary: { type: 'placeholder',  value: 'Type for hints...' },
    tertiary:  { type: 'text-content', value: '' },
    fallback:  { type: 'coordinates',  value: { x: 400, y: 300 } }
  },
  waitAfter:  500,
  maxRetries: 3,
  checkpoint: {
    type:  'element-visible',
    value: 'input[placeholder="Type for hints..."]'
  },
  knownOutcomes: [
    { pattern: 'No Records Found', type: 'business_outcome', reason: 'employee_not_found' }
  ],
  recoverableConditions: [
    { pattern: 'Session Expired', action: 're-login' }
  ]
}

export const sampleArtifact: Artifact = {
  artifactId:  'artifact-test-001',
  tenantId:    'tenant-001',
  version:     1,
  goal:        'Search for employee and return their ID',
  targetApp:      'https://opensource-demo.orangehrmlive.com',
  allowedDomains: ['https://opensource-demo.orangehrmlive.com'],
  createdAt:      '2026-08-16T10:00:00.000Z',
  allowWrites:    false,
  inputSchema: {
    employeeName: { type: 'string' }
  },
  outputSchema: {
    employeeId: { type: 'string', sensitive: false }
  },
  steps: [sampleStep]
}
