# Pre-PRD Clarification Questions

Questions to resolve before writing the product requirements document.

---

**1. What is the target application?**
The PDF says pick a proxy. The phased approach (clean DOM first, then expand to legacy/no-clean-DOM) is smart — but we need to actually name the target. What site/app are we automating against for the demo? This shapes everything downstream.

**2. What mechanism drives the UI?**
Screenshot + coordinates? DOM selectors? Accessibility tree? This is the central technical decision and the PDF explicitly leaves it to you. Need to pick one as primary before we can define how the artifact stores "how to find an element."

**3. What exactly is the artifact schema?**
The PDF calls this a focal point of the evaluation. Before writing requirements we need to agree on: what fields does it have, how are steps represented, how is element targeting encoded, how are inputs/outputs typed, what is the versioning model?

**4. What does "stuck" mean, concretely?**
The human escalation requirement hinges on this. Max steps hit? Confidence below a threshold? Same screenshot twice in a row? Need a definition before we can spec the escalation path.

**5. What is the error taxonomy?**
The PDF draws three buckets — expected business outcome, recoverable condition, hard failure. Do we agree with those three? How do we distinguish them in code?

**6. What are we mocking vs. actually building?**
The PDF explicitly allows mocking the operator console. What else are we comfortable mocking with a clean seam, and what must be real?

**7. Where do artifacts live?**
File system? Database? This affects replay, versioning, and the agent-facing interface.
