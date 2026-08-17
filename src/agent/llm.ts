import OpenAI from 'openai'
import { LLMAction, Checkpoint } from '../types'

const MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT = `You are navigating a web application to achieve a goal.
You will receive a summary of earlier steps, the last 10 steps in detail, and the current screenshot.
The browser viewport is exactly 1280x720 pixels. Use pixel coordinates within this range.
Use the decide_action function to return your decision every time.
For click and scroll actions, provide exact pixel coordinates (x, y) of the target in the screenshot.
For the first step, set checkpointForPreviousStep to null.
From step 2 onwards, examine the current screenshot and identify what on the page proves the previous action succeeded — that becomes the checkpoint.`

const TOOL: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'decide_action',
    description: 'Decide the next action to take to achieve the goal based on the current screenshot.',
    parameters: {
      type: 'object',
      properties: {
        checkpointForPreviousStep: {
          type: 'object',
          description: 'What on the current page proves the previous action succeeded. Omit on first step.',
          properties: {
            type:  { type: 'string', enum: ['url-contains', 'element-visible', 'text-present'] },
            value: { type: 'string', description: 'URL fragment, CSS selector, or visible text to check' }
          },
          required: ['type', 'value']
        },
        action: {
          type: 'string',
          enum: ['click', 'input', 'navigate', 'wait', 'scroll', 'keydown'],
          description: 'The action to perform'
        },
        coordinates: {
          type: 'object',
          description: 'Pixel coordinates in the 1280x720 screenshot. Required for click and scroll.',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' }
          },
          required: ['x', 'y']
        },
        targetDescription: {
          type: 'string',
          description: 'Human-readable description of the target element'
        },
        value: {
          type: 'string',
          description: 'Text to type (input), URL (navigate), key name (keydown). Omit for other actions.'
        },
        reasoning: {
          type: 'string',
          description: 'Why this action moves toward the goal'
        },
        requiresLogin: {
          type: 'boolean',
          description: 'True if this is a login page and human credentials are needed'
        },
        goalComplete: {
          type: 'boolean',
          description: 'True if the goal has been fully achieved'
        },
        updatedSummary: {
          type: 'string',
          description: 'Compact summary of all steps taken so far including this one'
        }
      },
      required: [
        'action',
        'targetDescription',
        'reasoning',
        'requiresLogin',
        'goalComplete',
        'updatedSummary'
      ]
    }
  }
}

export async function callLLM(
  client: OpenAI,
  goal: string,
  updatedSummary: string,
  recentSteps: string[],
  screenshotBase64: string,
  isFirstStep: boolean
): Promise<LLMAction> {
  const textParts = [
    `Goal: ${goal}`,
    updatedSummary ? `Summary of earlier steps:\n${updatedSummary}` : '',
    recentSteps.length > 0 ? `Recent steps:\n${recentSteps.join('\n')}` : '',
    isFirstStep
      ? 'This is the first step — set checkpointForPreviousStep to null.'
      : 'Examine the screenshot and declare what on the page proves the previous action succeeded.',
    'Current screenshot:'
  ].filter(Boolean).join('\n\n')

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: textParts },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` }
          }
        ]
      }
    ],
    tools: [TOOL],
    tool_choice: { type: 'function', function: { name: 'decide_action' } }
  })

  const toolCall = response.choices[0]?.message?.tool_calls?.[0]
  if (!toolCall) throw new Error('LLM did not return a tool call')

  const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>

  return {
    checkpointForPreviousStep: isFirstStep
      ? null
      : (input.checkpointForPreviousStep as Checkpoint | null ?? null),
    action:            input.action as LLMAction['action'],
    coordinates:       input.coordinates as { x: number; y: number } | undefined,
    targetDescription: input.targetDescription as string,
    value:             (input.value as string | null) ?? null,
    reasoning:         input.reasoning as string,
    requiresLogin:     input.requiresLogin as boolean,
    goalComplete:      input.goalComplete as boolean,
    updatedSummary:    input.updatedSummary as string
  }
}
