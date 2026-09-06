---
name: fix
description: "Investigate and fix bugs through reproduced symptoms, verified root cause and focused regression tests. Use for crashes, incorrect behavior and regressions."
---

# Fix

Follow reproduce/understand symptom → locate affected flow → gather evidence → identify likely root cause → verify hypothesis → implement smallest correct fix → regression test → code-review.

Capture expected versus actual behavior, inputs, environment, relevant errors and a minimal reproduction. Use Cortex and architecture context when available, then trace source through the failing flow. Inspect recent diffs, state transitions, async ordering and boundary contracts. Redact secrets in logs.

State a falsifiable hypothesis and an observation that distinguishes it from alternatives. Create a regression test that fails for the observed defect; verify it fails for the correct reason before implementing. If reproduction requires inaccessible infrastructure, disclose the limitation and isolate the contract with the closest meaningful test.

Reject blind null checks, random retries, arbitrary timeouts, catch-and-ignore and unrelated refactors unless evidence proves them appropriate. Address the cause, preserve public contracts and existing valid behavior, then rerun the regression and relevant surrounding tests. Review the diff for edge cases, summarize root cause and evidence, and invoke architecture-sync only for meaningful structural changes.
