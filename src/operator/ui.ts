import { Router, Request, Response } from 'express'

export const operatorRouter = Router()

operatorRouter.get('/:runId', (req: Request, res: Response) => {
  const { runId } = req.params
  res.send(buildOperatorPage(runId))
})

operatorRouter.get('/', (req: Request, res: Response) => {
  res.send(buildIndexPage())
})

function buildIndexPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BrowseMind Operator</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    p { color: #555; margin-bottom: 24px; }
    input { width: 100%; padding: 10px; font-size: 1rem; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; margin-bottom: 12px; }
    button { padding: 10px 24px; background: #1a1a1a; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; }
    button:hover { background: #333; }
  </style>
</head>
<body>
  <h1>BrowseMind Operator Console</h1>
  <p>Enter a Run ID to view its escalation status.</p>
  <input id="runId" placeholder="Run ID (e.g. abc-123)" />
  <button onclick="go()">View Run</button>
  <script>
    function go() {
      const id = document.getElementById('runId').value.trim()
      if (id) window.location.href = '/operator/' + id
    }
    document.getElementById('runId').addEventListener('keydown', e => { if (e.key === 'Enter') go() })
  </script>
</body>
</html>`
}

function buildOperatorPage(runId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BrowseMind Operator — ${runId}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
    h1 { font-size: 1.4rem; margin-bottom: 4px; }
    .runid { font-size: 0.8rem; color: #888; margin-bottom: 24px; font-family: monospace; }
    .card { background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #888; margin-bottom: 4px; }
    .value { font-size: 1rem; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; }
    .status.stuck { background: #fff3cd; color: #856404; }
    .status.running { background: #d1fae5; color: #065f46; }
    .status.success { background: #d1fae5; color: #065f46; }
    .status.failed { background: #fee2e2; color: #991b1b; }
    .status.login_required { background: #dbeafe; color: #1e40af; }
    .status.confirmation_required { background: #ede9fe; color: #5b21b6; }
    .reason { background: #fff8f0; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-family: monospace; font-size: 0.9rem; word-break: break-word; }
    .screenshot { max-width: 100%; border: 1px solid #ddd; border-radius: 6px; margin-top: 8px; }
    .actions { display: flex; gap: 12px; margin-top: 24px; }
    button { padding: 12px 28px; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; font-weight: 600; }
    .btn-takeover { background: #f59e0b; color: white; }
    .btn-takeover:hover { background: #d97706; }
    .btn-done { background: #10b981; color: white; }
    .btn-done:hover { background: #059669; }
    .btn-done:disabled { background: #9ca3af; cursor: not-allowed; }
    textarea { width: 100%; padding: 10px; font-size: 0.95rem; border: 1px solid #ccc; border-radius: 6px; margin-top: 12px; height: 80px; resize: vertical; }
    .message { padding: 12px 16px; border-radius: 6px; margin-top: 16px; font-size: 0.9rem; }
    .message.info { background: #dbeafe; color: #1e40af; }
    .message.success { background: #d1fae5; color: #065f46; }
    .message.error { background: #fee2e2; color: #991b1b; }
    a { color: #555; font-size: 0.85rem; }
  </style>
</head>
<body>
  <a href="/operator">&#8592; All Runs</a>
  <h1 style="margin-top:16px">Operator Console</h1>
  <div class="runid">Run: ${runId}</div>

  <div id="content">Loading...</div>

  <script>
    const runId = '${runId}'
    let tookOver = false

    async function poll() {
      try {
        const res = await fetch('/api/v1/runs/' + runId + '/status')
        if (!res.ok) { document.getElementById('content').innerHTML = '<div class="message error">Run not found.</div>'; return }
        const data = await res.json()
        render(data)
      } catch(e) {
        console.error(e)
      }
    }

    function render(data) {
      const ir = data.interventionRequest
      let html = '<div class="card">'
      html += '<div class="label">Status</div><div><span class="status ' + data.status + '">' + data.status.replace(/_/g,' ') + '</span></div>'
      html += '<div style="margin-top:12px"><div class="label">Current Step</div><div class="value">' + data.currentStep + '</div></div>'
      html += '</div>'

      if (data.status === 'stuck' && ir) {
        html += '<div class="card">'
        html += '<div class="label">Goal</div><div class="value" style="margin-bottom:12px">' + escHtml(ir.goalDescription) + '</div>'
        html += '<div class="label">Why Stuck</div><div class="reason">' + escHtml(ir.whyStuck) + '</div>'
        if (ir.screenshotPath) {
          html += '<div style="margin-top:12px"><div class="label">Screenshot (before)</div>'
          html += '<img src="' + ir.screenshotPath + '" class="screenshot" /></div>'
        }
        html += '</div>'

        html += '<div class="actions">'
        if (!tookOver) {
          html += '<button class="btn-takeover" onclick="takeover()">Take Over Browser</button>'
        }
        html += '</div>'
        html += '<textarea id="notes" placeholder="Describe what you did (optional)"></textarea>'
        html += '<div class="actions"><button class="btn-done" ' + (tookOver ? '' : 'disabled') + ' id="doneBtn" onclick="done()">I\'m Finished &#x2713;</button></div>'
        html += '<div id="msg"></div>'

      } else if (data.status === 'success') {
        html += '<div class="message success">&#x2713; Run completed successfully.</div>'
      } else if (data.status === 'failed') {
        html += '<div class="message error">&#x2717; Run failed: ' + escHtml(data.error?.observed ?? 'unknown error') + '</div>'
      } else if (data.status === 'running') {
        html += '<div class="message info">Automation is running...</div>'
      } else if (data.status === 'login_required') {
        html += '<div class="message info">Login required — please log in in the browser and call POST /resume.</div>'
      }

      document.getElementById('content').innerHTML = html
    }

    async function takeover() {
      const res = await fetch('/api/v1/runs/' + runId + '/takeover', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' })
      if (res.ok) {
        tookOver = true
        document.querySelector('.btn-takeover').style.display = 'none'
        document.getElementById('doneBtn').disabled = false
        showMsg('You have control of the browser. Complete the step manually, then click "I\'m Finished".', 'info')
      }
    }

    async function done() {
      const notes = document.getElementById('notes').value
      const res = await fetch('/api/v1/runs/' + runId + '/resume', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ humanNotes: notes })
      })
      if (res.ok) {
        showMsg('Automation resuming...', 'success')
        setTimeout(poll, 2000)
      } else {
        showMsg('Error: ' + (await res.text()), 'error')
      }
    }

    function showMsg(text, type) {
      const el = document.getElementById('msg')
      if (el) el.innerHTML = '<div class="message ' + type + '">' + text + '</div>'
    }

    function escHtml(s) {
      if (!s) return ''
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }

    poll()
    setInterval(poll, 3000)
  </script>
</body>
</html>`
}
