# Known Limitations

Things that are understood and deliberately unfixed, with the reasoning. Not bugs
found in passing — each of these was traced to a cause and left open on purpose.

## Multi-record goals

### Mixed record markers in one goal

`splitGoalSamples()` resolves records two ways, and only one of them runs:

1. **Explicit markers** — `Second product:`, `2.`, `2)`, `Product #2:`, `2nd item:`,
   `---`. Matched by regex.
2. **Structural repetition** — when the label that opened record 1 appears again,
   a new record has started. Needs no marker vocabulary, so plain `-`, `*`, `•`
   bullets and unmarked records all work through this path.

The fallback fires **only when no marker matched anywhere in the goal**. A goal
that mixes both styles therefore loses records:

```
Add these products.
Product Name: "Cable Tester", SKU: "TL-4471"

Second product:
Product Name: "Task Chair", SKU: "FN-2208"

- Product Name: "Label Printer", SKU: "OF-9930"      <- swallowed into record 2
```

The marker path wins on `Second product:`, so structural detection never runs and
the bare bullet is not seen as a boundary. Record 3 is absorbed into record 2, and
its values silently override record 2's during replay.

**Why unfixed:** running both detectors and merging their boundaries risks
splitting a single record whose prose happens to repeat a label. Real goals use one
style throughout, so the cost of the fix currently outweighs the risk it removes.

**If it bites:** the symptom is one fewer replay run than records in the goal.
Check `[capture] goal holds N record(s)` in the server log against what you wrote.

### The goal format is a contract

Values must be `Label: "quoted value"`. A goal phrased as *"set the name to Ana"*
parses zero fields, so no replay records are produced and no label→variable
mapping can be built. This is a format assumption, not a domain one — it applies
equally to patients, invoices and products.

## Field targeting

### Generic shared words can match the wrong field

`findFieldByDescription()` scores by how much of the description a field's
label/placeholder/name/id accounts for. A description sharing only a *generic*
word with a field can still match it — "Passport Number" resolves to a "Phone
Number" field on the strength of `number` alone.

**Why unfixed:** requiring two or more keyword hits would break legitimate
single-keyword descriptions such as "Gender dropdown". The fill-verification step
is the backstop — it reads the value back from the field it resolved, and both
paths now share one matcher, so they cannot disagree.

### Unlabelled forms fall back to coordinates

The matcher reads `label`, `placeholder`, `name` and `id`. A form built from
unlabelled divs with styled inputs gives it nothing to score, and targeting
degrades to capture-time coordinates.

## Checkpoints

### Mid-form steps often carry a weak checkpoint

The LLM sometimes returns a field *description* where a CSS selector is expected
(`element-visible="Emergency Contact Phone field"`). Checkpoint validation catches
this and substitutes `url-contains=<current page>`, which cannot fail while
filling a form.

Consequence: a mid-form step could silently do nothing and replay would not
notice. The final submit step is unaffected — it gets a real checkpoint derived
from the success signal observed on the page.
