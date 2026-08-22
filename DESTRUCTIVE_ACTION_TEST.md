# Destructive Action Confirmation - Implementation & Test

## What Was Implemented

Automatic human confirmation for destructive operations (delete, remove, destroy, etc.) in both **capture** and **replay** phases.

### Changes Made

1. **`src/replay/replay.ts`** (lines 65-135)
   - When a destructive action is detected → sets status to `confirmation_required`
   - Waits for human via `waitForHandoff()`
   - On approval → continues execution
   - On cancellation → fails the run
   - Logs the human's notes

2. **`src/agent/discovery.ts`** (imports + lines 1598-1645)
   - Same logic for capture phase
   - Detects destructive actions before execution
   - Prompts human for confirmation
   - Proceeds or cancels based on response

3. **`src/replay/guardrails.ts`** (existing)
   - `classifyAction()` detects destructive keywords: `delete|remove|destroy|wipe|drop|purge|clear all`
   - Returns actionClass: `'destructive'` when pattern matches

4. **`mockwebsites/meditrack/patient-detail.html`**
   - Added "🗑️ Delete Patient" button
   - Calls `deletePatient(id, name)` function
   - Shows browser `confirm()` dialog (native confirmation)
   - Calls DELETE `/api/patients/:id`

5. **`src/meditrack/server.ts`** (new endpoint)
   - `DELETE /api/patients/:id` — removes patient from database
   - Returns success message

6. **UI** (existing, already worked)
   - `src/ui/index.html` lines 535-549 show confirmation banner
   - "Approve — Continue" button calls `resumeRun('')`
   - "Cancel Run" button calls `cancelRun()`
   - Backend `/api/v1/runs/:runId/resume` calls `signalHandoff()`

## How It Works

### Detection
When BrowseMind encounters an action with description containing:
- "delete patient"
- "remove record"
- "destroy data"
- etc.

→ `classifyAction()` returns `'destructive'`

### Confirmation Flow

**Capture Phase:**
1. LLM generates action: `{ action: 'click', targetDescription: 'Delete patient button' }`
2. Discovery detects "delete" keyword → pauses
3. UI shows: "🛑 Confirmation required — BrowseMind detected a potentially destructive action"
4. Human clicks "Approve — Continue" or "Cancel Run"
5. If approved → executes the delete, captures the step
6. If cancelled → run fails with "destructive action cancelled by human"

**Replay Phase:**
Same flow, but happens when executing an artifact that contains a destructive step.

## Test Scenarios

### Scenario 1: Delete Patient (MediTrack)

**Target App:** `http://127.0.0.1:4300`

**Natural Language Input (Capture):**
```
Go to the patients tab. Click on the first patient in the list to view their profile.
Click the "Delete Patient" button to remove this patient from the system.
```

**Expected Flow:**
1. BrowseMind navigates to patients list
2. Clicks first patient → opens patient-detail.html
3. Detects "Delete Patient" button click as **destructive** (description contains "delete")
4. **Pauses** → UI shows confirmation banner
5. Human clicks **"Approve — Continue"**
6. BrowseMind clicks the button → browser shows native confirm dialog
7. (In headless Playwright, `confirm()` auto-accepts OR we'd need to handle it)
8. Backend deletes the patient
9. Artifact saved with the destructive step

**Replay:**
- Uses the same artifact with different patient ID (via inputs)
- Pauses again at the delete step
- Human confirms → patient deleted

### Scenario 2: Delete Patient with Cancellation

**Natural Language Input:**
```
Go to patients, open patient Margaret Thornton (P001), and delete her record.
```

**Expected Flow:**
1-3. Same as above
4. **Pauses** for confirmation
5. Human clicks **"Cancel Run"**
6. Run fails with error: "destructive action cancelled by human"
7. Patient NOT deleted (action never executed)

### Scenario 3: Multiple Patients with Mixed Confirmation

**Natural Language Input (with multi-record):**
```
1) Go to patients, open patient P001, delete the patient.
2) Go to patients, open patient P002, delete the patient.
```

**Expected Flow:**
- Capture uses only record 1 (P001)
- Asks confirmation → human approves → P001 deleted
- Replay runs for record 2 (P002)
- Asks confirmation again → human can approve or deny
- If denied: P002 NOT deleted, run fails

## Testing Steps

### 1. Restart MediTrack Server
The delete button and endpoint are now available:

```bash
# Kill existing meditrack (if running on different port)
# The instance on 4300 is managed by start-mock-sites.js
# Restart it:
pkill -f "start-mock-sites.js"
node start-mock-sites.js &
```

Or just restart the mock sites script.

### 2. Test Manually (Browser)
1. Open http://127.0.0.1:4300/patients
2. Click any patient
3. Click "🗑️ Delete Patient" button
4. See native browser confirm() dialog
5. Confirm → patient deleted, redirected to patients list

### 3. Test with BrowseMind (Capture)
1. Open http://localhost:3000
2. Enter goal: `Go to patients, click on patient Margaret Thornton, and click the delete patient button.`
3. Target App: `http://127.0.0.1:4300`
4. Click "Start Capture"
5. **Watch for confirmation modal** — should appear when BrowseMind tries to click "Delete Patient"
6. Click "Approve — Continue"
7. Capture completes, artifact saved

### 4. Test with BrowseMind (Replay)
1. Take the artifact ID from capture
2. Create a replay run with that artifact
3. Should pause again at the delete step
4. Approve or cancel

## Important Notes

### Browser `confirm()` Dialog
The patient-detail.html uses native `confirm()` which:
- In headed browser: shows a blocking dialog
- In Playwright headless: **auto-accepts by default**

For true testing, we'd need to either:
- Run in headed mode (`headless: false`)
- Mock the confirm with a custom modal
- Use Playwright's `page.on('dialog')` handler

### Confirmation is Asked BEFORE the Action
The destructive confirmation happens **before** BrowseMind clicks the delete button.
So the flow is:
1. BrowseMind: "I want to click 'Delete Patient'"
2. BrowseMind: "Wait, that's destructive — ask human"
3. Human: "Yes, proceed"
4. BrowseMind: *clicks button*
5. Browser: *shows confirm() dialog*
6. (Auto-accept or human confirms again)
7. DELETE request sent

So there are actually **two confirmations**:
- BrowseMind's confirmation (our new feature)
- Browser's confirm() dialog (existing in the HTML)

For a cleaner test, we could remove the browser confirm() from the deletePatient function.

## Alternative Test (No Browser Confirm)

Modify `patient-detail.html` line 166-170 to remove the `confirm()` call:

```javascript
function deletePatient(patientId, patientName) {
  // REMOVED: var confirmDelete = confirm(...);
  // REMOVED: if (!confirmDelete) return;
  
  fetch('/api/patients/' + patientId, {
    method: 'DELETE'
  })
  // ... rest
}
```

Then only BrowseMind's confirmation fires (cleaner test).

## Expected Behavior Summary

✅ **Destructive actions are detected automatically** (no need to specify in prompt)
✅ **Both capture and replay pause for confirmation**
✅ **Human can approve or cancel**
✅ **If cancelled, action is not executed**
✅ **If approved, action proceeds and is logged with humanNotes**
✅ **UI already supports the confirmation_required status**

## Files Modified

- `src/replay/replay.ts` — destructive confirmation in replay
- `src/agent/discovery.ts` — destructive confirmation in capture
- `mockwebsites/meditrack/patient-detail.html` — added delete button + function
- `src/meditrack/server.ts` — added DELETE endpoint
- Branch: `feature/destructive-confirmation-handoff`
