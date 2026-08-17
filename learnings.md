# Learnings — Computer-Use Automation System

## 1. Screenshot + Coordinates — Your Primary and Most-Used Approach

This was the backbone of the entire platform. Every executor you built relied on it:

**Magnitude (primary path):**
- Takes a screenshot → sends to Claude Sonnet → Claude decides what to do next → acts → repeat
- No DOM selectors involved. Claude reasons purely from what the page looks like
- You ran this with a visible browser window (not headless) because it was more reliable for complex interactions

**BrowserUse (vision hybrid):**
- Brought in specifically for pages where DOM-based approaches failed
- Pure vision — understands pages entirely from screenshots
- Used alongside Magnitude in a "hybrid graph" where BrowserUse handled visually complex steps and Magnitude handled the rest

**Stagehand:**
- Evaluated as an alternative — also screenshot-based, wraps Playwright with AI-assisted element finding
- Ran side-by-side evals against Magnitude (commit 99c4579 — "eval logs from Stagehand vs Magnitude side-by-side run")
- Eventually Magnitude won as the primary path

**Key learning:** Screenshot-based reasoning is robust against DOM changes (CSS class renames, ID changes, layout shifts), which is the core problem with traditional selectors. But it's slower and can be fingerprinted by bot-detection systems.

---

## 2. OS-Level Automation (CUA) — Your Bot-Detection Solution

This came from a concrete problem: Indeed + Cloudflare blocked everything else.

Cloudflare can fingerprint Playwright-based browsers by analyzing:
- Timing patterns
- JavaScript API behaviour
- Request signatures

The solution was CUA (Computer Use Agent) using OpenAI's computer-use-preview model:
- Receives a screenshot → returns exact pixel x,y coordinates for where to click
- That click is dispatched as a real OS-level input event, NOT through Playwright's JS bridge
- From Cloudflare's perspective = indistinguishable from a real human mouse

This is the structural difference from Magnitude: Magnitude drives the browser via Playwright APIs (still a JS bridge), CUA drives via OS input events.

**Key learning:** OS-level automation bypasses bot detection because events arrive through the operating system input stack, not through JavaScript. The tradeoff is you lose all DOM context — CUA is pure vision with zero knowledge of the page structure.

**Note:** `executeCUALoop` and `getCUAActionsForStep` in `lib/cua.ts` are broken/deprecated due to a signature mismatch. The live path is `/api/ai/cua-action` using `getCUAAction` directly.

---

## 3. Accessibility Tree — NOT directly used

You did not use Playwright's accessibility tree APIs (`getByRole`, `getByLabel`, `getByText`, ARIA selectors) as an automation strategy.

What you did use that's adjacent to it was DOM fingerprinting in the GPT-5/DSL path:
- When the Chrome extension records an action, it captures: ID attributes, aria-labels, roles, data-* attributes, class combinations, visible text, sibling index, nearest ancestor test IDs
- GPT-5 is given this DOM fingerprint + a screenshot to locate the target element
- Element priority: `id` → `name` → `data-*` → `aria-label` → unique classes → text content

This is DOM-attribute-based matching (closer to "accessibility metadata" than "accessibility tree traversal"), but it's fundamentally different from using Playwright's `page.getByRole()` or `page.getByLabel()` APIs.

---

## The Progression in One Line

```
Magnitude (screenshot→Claude)
  → + Stagehand eval
  → + BrowserUse for vision-hard steps (hybrid)
  → Hit Cloudflare wall on Indeed
  → CapSolver (partial fix)
  → CUA with OS-level events (structural fix)
```

**The core lesson:** Screenshot-based AI reasoning solves dynamic DOM problems, but OS-level input dispatch is what solves bot detection problems. They address different layers of the same challenge.
