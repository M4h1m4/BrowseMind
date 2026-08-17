# Decisions Pending

Questions we are actively working through. Once finalized, move to decisions.md.

---

## Decision 2: UI Mechanism (how the agent perceives and acts on the page)

### The approach: Screenshot + Coordinates + Extraction (Hybrid)

During discovery, the LLM uses screenshots to navigate and decide what to do next. But at each step, in parallel, we also extract stable signals from that element to enrich the artifact. Replay uses those stored signals — no LLM, no screenshot reasoning.

```
Screenshot → LLM decides what to click
                    ↓
         Agent acts (clicks x, y)
                    ↓
         Extraction runs on that element
         capturing: label, role, position, placeholder, etc.
                    ↓
         Artifact stores BOTH coordinates AND extracted attributes
                    ↓
Replay: uses stored attributes to find element deterministically
```

### The pending decision: DOM extraction vs Accessibility tree

**Option A: Screenshot + Coordinates + DOM extraction (`page.evaluate()`)**
- Pros: richer data on web apps, captures text, placeholder, aria-label, class combinations
- Cons: web-only, breaks completely on desktop apps, DOM on legacy apps can still be messy

**Option B: Screenshot + Coordinates + Accessibility tree**
- Pros: works on both web AND desktop (browsers + OS both expose accessibility tree), single abstraction across surfaces, cleaner seam for Phase 2 (desktop)
- Cons: legacy apps often have poor accessibility attributes, tree may be sparse or missing labels on OrangeHRM

**Option C: Screenshot + Coordinates + Accessibility tree (primary) + DOM extraction (fallback on web)**
- Pros: best of both, accessibility tree keeps the abstraction clean across phases, DOM fills gaps on web when tree is sparse
- Cons: more complexity upfront

### Why this matters
The extraction mechanism determines what the artifact stores per step. The artifact schema and replay engine are downstream of this decision. Getting this wrong means rewriting both.

---
