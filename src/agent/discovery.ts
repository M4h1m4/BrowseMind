import { chromium, Browser } from 'playwright'
import OpenAI from 'openai'
import { RunState } from '../types'
import { callLLM } from './llm'
import { executeAction } from './actions'
import { extractElementData } from './extractor'
import { ArtifactBuilder } from './builder'
import { saveArtifact } from '../artifact/repository'
import { writeRunLog } from './logger'

const MAX_STEPS  = parseInt(process.env.MAX_STEPS_CAPTURE ?? '25')
const CTX_WINDOW = 10

export async function runDiscovery(
  runState: RunState,
  goal: string,
  targetApp: string,
  tenantId: string,
  client: OpenAI = new OpenAI()
): Promise<void> {
  const builder = new ArtifactBuilder()
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({ headless: false })
    const context = await browser.newContext()
    const page    = await context.newPage()

    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(targetApp, { waitUntil: 'networkidle' })

    let updatedSummary  = ''
    const stepLog: string[] = []
    let stepNumber = 1

    while (stepNumber <= MAX_STEPS) {
      // 1. Screenshot — JPEG at 70% quality keeps token cost low
      const screenshot       = await page.screenshot({ type: 'jpeg', quality: 70 })
      const screenshotBase64 = screenshot.toString('base64')

      // 2. Sliding context window — last 10 step descriptions + running summary
      const windowSteps = stepLog.slice(-CTX_WINDOW)
      const isFirstStep = stepNumber === 1

      // 3. LLM decision
      const action = await callLLM(
        client,
        goal,
        updatedSummary,
        windowSteps,
        screenshotBase64,
        isFirstStep
      )

      updatedSummary       = action.updatedSummary
      runState.currentStep = stepNumber

      // 4. Login required — pause (session management wired in Phase 6)
      if (action.requiresLogin) {
        runState.status   = 'login_required'
        runState.isPaused = true
        console.log(`[discovery] login required at step ${stepNumber} — pausing`)
        break
      }

      console.log(
        `[discovery] step ${stepNumber}: ${action.action} — "${action.targetDescription}"`
      )

      // 5. Execute action
      await executeAction(page, action)

      // 6. DOM extraction at action coordinates
      const coords      = action.coordinates ?? { x: 640, y: 360 }
      const elementData = await extractElementData(page, coords.x, coords.y)

      // 7. Accumulate step in artifact builder
      builder.addStep(action, elementData, stepNumber)

      // 8. Track step description for context window
      stepLog.push(
        `Step ${stepNumber}: ${action.action} on "${action.targetDescription}" — ${action.reasoning}`
      )

      // 9. Append step to run log
      runState.log.steps.push({
        stepNumber,
        startTime:           new Date().toISOString(),
        endTime:             new Date().toISOString(),
        retryCount:          0,
        status:              'success',
        elementStrategyUsed: 'primary',
        sensitive:           false   // discovery steps classified sensitive at build time in builder.ts
      })

      // 10. Goal complete
      if (action.goalComplete) {
        runState.status = 'success'
        console.log(`[discovery] goal complete after ${stepNumber} steps`)
        break
      }

      stepNumber++
    }

    // Max steps exceeded
    if (stepNumber > MAX_STEPS && runState.status === 'running') {
      runState.status      = 'failed'
      runState.log.error   = {
        step:     stepNumber,
        expected: 'goal complete',
        observed: `max steps (${MAX_STEPS}) exceeded`,
        type:     'hard_failure'
      }
      console.log(`[discovery] max steps (${MAX_STEPS}) exceeded — stopping`)
    }

    // Save artifact on success
    if (runState.status === 'success') {
      const artifact        = builder.build(goal, targetApp, tenantId)
      saveArtifact(artifact)
      runState.artifactId   = artifact.artifactId
      runState.log.artifactId = artifact.artifactId
      console.log(`[discovery] artifact saved — id: ${artifact.artifactId}`)
    }

  } catch (err) {
    const message        = err instanceof Error ? err.message : String(err)
    runState.status      = 'failed'
    runState.log.error   = {
      step:     runState.currentStep,
      expected: 'successful navigation',
      observed: message,
      type:     'hard_failure'
    }
    console.error(`[discovery] error at step ${runState.currentStep}: ${message}`)

  } finally {
    runState.log.completedAt = new Date().toISOString()
    runState.log.status      = runState.status
    writeRunLog(runState.log)
    await browser?.close()
  }
}
