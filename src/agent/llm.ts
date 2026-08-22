import OpenAI from 'openai'
import { LLMAction, Checkpoint } from '../types'

const MODEL = 'gpt-4o'

const SYSTEM_PROMPT = `You are navigating a web application to achieve a goal.
You will receive a summary of earlier steps, the last 10 steps in detail, and the current screenshot.
The browser viewport is exactly 1280x720 pixels. Use pixel coordinates within this range.
Use the decide_action function to return your decision every time.
For click and scroll actions, provide exact pixel coordinates (x, y) of the target in the screenshot.
For the first step, set checkpointForPreviousStep to null.
From step 2 onwards, examine the current screenshot and identify what on the page proves the previous action succeeded — that becomes the checkpoint.

STANDARD ACTIONS (click, input, navigate, scroll, keydown, wait):
- Use these to interact with the page normally. Always provide coordinates for click/scroll.
- Navigate to a URL by setting action='navigate' and value=<full URL>.

CLICKING — USE THE PROVIDED COORDINATES:
- The system provides a CLICKABLE ELEMENTS list with the exact CENTER COORDINATES of every button and link on the page.
- ALWAYS take click coordinates from that list by matching the element's label. Do NOT estimate a position from the screenshot — screenshot estimates are frequently off by enough to miss the target entirely.
- An element marked [OFF-SCREEN] is still clickable: use its listed coordinates and the system will scroll to it. Do not skip it, and do not conclude the button is missing.
- The button that saves the form is marked [SUBMITS THE FORM] — that is the one to click when you are done filling fields.
- If a previous step reports HIT NOTHING, your click did NOT happen. Do not wait for its result and do not repeat the same coordinates — take the coordinates from the CLICKABLE ELEMENTS list instead.

FORM FILLING:
- When filling a form, the system provides a FORM FIELDS list with each field's label, id, type, placeholder, and CENTER COORDINATES.
- ALWAYS use the coordinates from the FORM FIELDS list for input actions — do NOT guess coordinates from the screenshot.
- Fill fields ONE AT A TIME. Do NOT skip fields or batch multiple fields into one action.
- The ORDER in which you fill the fields comes from the USER'S INPUT GOAL — fill them in the exact sequence the data is mentioned there, NOT in the order the FORM FIELDS list or the screenshot happens to show them.
- For select/dropdown fields (type=select-one), use action='input' with value set to the desired option text (e.g. value="Male" for a gender dropdown). The system will programmatically select the correct option — do NOT click to open the dropdown, do NOT click on an option. Just use input with the value.
- If the goal gives one value for a form that has separate fields (e.g. a full name where the form has "First Name" and "Last Name"), split it across those fields: the leading part goes in the first field, the trailing part in the second.
- Do NOT click on sidebar navigation or other page elements while filling a form — stay focused on the form fields.
- After filling all fields, click the submit/save/register button.

STRICT SEQUENTIAL FIELD ORDER (MANDATORY):
- You MUST fill form fields in the EXACT order the data appears in the user's goal text. Read the goal carefully and identify the sequence of fields mentioned.
- After filling one field, your next input action MUST be for the NEXT field listed in the goal text. Do NOT jump ahead or reorder.
- Every single field mentioned in the goal MUST be filled. Do NOT omit any field — dropdowns and select fields count, not just text inputs.
- Use the FORM FIELDS list to LOCATE the correct field on the page (find its coordinates by matching the label), but follow the GOAL TEXT for the order of filling.
- If the next field from the goal is off-screen, the system will auto-scroll to it — just use the coordinates from the FORM FIELDS list.
- Violating this order will produce an incorrect artifact. This rule is non-negotiable.

MULTIPLE DATA SAMPLES:
- If the goal contains multiple data records (e.g. "... Second record: ...", "Second entry:", "2.", or the same set of fields repeated), during CAPTURE you must ONLY use the FIRST data record.
- Complete the entire workflow (navigate → fill form → submit → verify success) using ONLY the first record's data.
- IGNORE all subsequent records during capture. Do NOT start filling a second record. Do NOT navigate back to create another entry.
- The second and subsequent records exist solely for REPLAY — they will be provided as replay inputs later.
- After successfully submitting the FIRST record and seeing the success confirmation, set goalComplete=true. Do NOT continue to a second record.

SCROLLING:
- Some form fields may be marked [OFF-SCREEN] in the FORM FIELDS list. You MUST still fill them.
- If the target field is off-screen, use action='scroll' with coordinates=(640, 360) to scroll the page, then fill the field on the next step.
- The system will automatically scroll to the correct field during input — you do NOT need to manually scroll before each input. Just use the field's coordinates from the FORM FIELDS list even if it says [OFF-SCREEN].
- When you cannot find the submit button in the screenshot, scroll down to find it — do NOT give up or declare goal complete without finding it.

MUTATING ACTIONS — isMutating flag:
- Set isMutating=true on ANY action that writes, submits, saves, deletes, or modifies data on the target application.
- Examples: clicking "Submit", "Register", "Save", "Delete", "Confirm", "Add", "Update", "Remove", "Post", "Send" buttons.
- Examples: pressing Enter to submit a form, clicking a delete icon, confirming a modal that triggers a write.
- Do NOT set isMutating=true for: navigation clicks (tabs, menus, links), buttons that OPEN a form (e.g. "Create New", "New Record", "Add New ..."), "View", "Back", "Cancel" links, form input filling, selecting dropdown options, scrolling, or read-only actions.
- ONLY the final form submission button (e.g. "Save", "Submit", "Register", "Create") is mutating — NOT the link/button that navigates TO the form.
- During capture (learning phase), mutating actions are executed to verify the workflow works end-to-end. They will also execute during replay.
- After a mutating action is executed, the page state may change (e.g. success message appears). Use this to verify the action worked, then continue.

DATA COLLECTION ACTIONS — use these in sequence for data extraction tasks:
1. loop — ONE single step that defines the entire repeating pattern. Set:
   - loopSelector: CSS selector matching ALL rows to iterate (e.g. '#recent-tbody tr')
   - innerSteps: COMPLETE array of actions to do per row (click, extract, navigate back, etc.)
   IMPORTANT: Output 'loop' EXACTLY ONCE. Do NOT output loop multiple times. All inner steps must be inside innerSteps in that one call.

2. extract — reads text from a page element into a named variable. Set:
   - coordinates: the pixel position (x, y) of the element you want to read in the screenshot
   - variableName: e.g. 'rowTitle' (referenced as {{rowTitle}} later)
   - cssSelector: your best guess at a CSS selector (optional — BrowseMind will probe the real selector from the DOM using your coordinates)
   IMPORTANT: always provide coordinates for extract steps. BrowseMind uses them to find the exact element on the live page.
   Use extract as an innerStep inside a loop, or standalone.

3. output — writes all collected variables to a file. Set:
   - outputFormat: 'json' or 'csv'
   - outputPath: e.g. 'out/results.csv'
   - outputFields: [{header: 'Title', variable: '{{rowTitle}}'}, ...]
   CRITICAL: the variable in each outputField (e.g. '{{rowTitle}}') MUST exactly match the variableName
   used in the corresponding extract innerStep (e.g. 'rowTitle'). Never use a different name.
   Use output AFTER the loop step, then set goalComplete: true.

WORKFLOW FOR DATA COLLECTION:
Step 1: Navigate to the target page (navigate action)
Step 2: loop — define loopSelector + all innerSteps at once
Step 3: output — write collected data to file, set goalComplete: true

Do NOT repeat the loop action. Do NOT use loop without innerSteps populated.

WORKFLOW FOR WRITE TASKS (form submission, creating records, etc.):
Step 1: Navigate to the form page
Step 2-N: Fill in form fields using input actions — STRICTLY in the order the data appears in the goal text. Every field must be filled, none skipped.
Step N+1: Click the submit/register/save button with isMutating=true AND goalComplete=true
There is NO output step for write tasks — set goalComplete on the final mutating submit action.
REMINDER: If the goal has multiple data samples, only use the FIRST one. Stop after submitting the first record successfully.

CRITICAL RULE — goalComplete:
- For DATA COLLECTION tasks: goalComplete may ONLY be true on the 'output' action.
- For WRITE tasks (no data to extract): goalComplete may ONLY be true on the final isMutating click (the submit/save/register button).
- Setting goalComplete=true on navigate, scroll, input, extract, loop, wait, or non-mutating clicks is FORBIDDEN.
- If you have not yet submitted the form, you are NOT done — keep going.`

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
          enum: ['click', 'input', 'navigate', 'wait', 'scroll', 'keydown', 'extract', 'loop', 'output'],
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
        isMutating: {
          type: 'boolean',
          description: 'True if this action modifies data on the target application (e.g. submitting a form, deleting a record, saving changes). False for navigation, reading, form filling, scrolling.'
        },
        updatedSummary: {
          type: 'string',
          description: 'Compact summary of all steps taken so far including this one'
        },
        cssSelector: {
          type: 'string',
          description: 'CSS selector for the element to read text from (extract) or the repeated row selector (loop)'
        },
        variableName: {
          type: 'string',
          description: 'Variable name to store the extracted text into, referenced as {{variableName}} in later steps (extract action)'
        },
        attribute: {
          type: 'string',
          description: "HTML attribute to read instead of textContent, e.g. 'href' or 'data-id' (extract action, optional)"
        },
        loopSelector: {
          type: 'string',
          description: 'CSS selector matching every row/item to iterate over (loop action)'
        },
        innerSteps: {
          type: 'array',
          description: 'Steps to execute for each matched row (loop action). Each element has the same shape as a decide_action response.',
          items: { type: 'object' }
        },
        outputFormat: {
          type: 'string',
          enum: ['json', 'csv'],
          description: 'File format for the output (output action)'
        },
        outputPath: {
          type: 'string',
          description: "File path relative to cwd where data is written, e.g. 'out/results.csv' (output action)"
        },
        outputFields: {
          type: 'array',
          description: 'List of field mappings from variable to output column/key (output action)',
          items: {
            type: 'object',
            properties: {
              header:   { type: 'string', description: 'Column name / JSON key' },
              variable: { type: 'string', description: 'Variable reference e.g. {{rowTitle}}' }
            },
            required: ['header', 'variable']
          }
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

async function callWithRetry(fn: () => Promise<OpenAI.ChatCompletion>, maxRetries = 4): Promise<OpenAI.ChatCompletion> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const is429 = msg.includes('429') || msg.includes('Rate limit')
      if (!is429 || attempt === maxRetries) throw err
      // Exponential backoff: 5s, 10s, 20s, 40s
      const delay = 5000 * Math.pow(2, attempt)
      console.log(`[llm] rate limited — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('callWithRetry: unreachable')
}

export async function callLLM(
  client: OpenAI,
  goal: string,
  updatedSummary: string,
  recentSteps: string[],
  screenshotBase64: string,
  isFirstStep: boolean,
  formContext: string = ''
): Promise<LLMAction> {
  const textParts = [
    `Goal: ${goal}`,
    updatedSummary ? `Summary of earlier steps:\n${updatedSummary}` : '',
    recentSteps.length > 0 ? `Recent steps:\n${recentSteps.join('\n')}` : '',
    formContext || '',
    isFirstStep
      ? 'This is the first step — set checkpointForPreviousStep to null.'
      : 'Examine the screenshot and declare what on the page proves the previous action succeeded.',
    'Current screenshot:'
  ].filter(Boolean).join('\n\n')

  const response = await callWithRetry(() => client.chat.completions.create({
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
  }))

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
    updatedSummary:    input.updatedSummary as string,
    isMutating:        (input.isMutating as boolean | undefined) ?? false,
    cssSelector:       input.cssSelector  as string | undefined,
    variableName:      input.variableName as string | undefined,
    attribute:         input.attribute    as string | undefined,
    loopSelector:      input.loopSelector as string | undefined,
    innerSteps:        input.innerSteps   as LLMAction[] | undefined,
    outputFormat:      input.outputFormat as 'json' | 'csv' | undefined,
    outputPath:        input.outputPath   as string | undefined,
    outputFields:      input.outputFields as import('../types').OutputField[] | undefined,
  }
}
