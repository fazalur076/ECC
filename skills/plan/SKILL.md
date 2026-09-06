---
name: plan
description: "Plan substantial features, migrations and changes across modules from repository evidence. Skip formal planning for straightforward local edits."
---

# Plan

Use healthy Cortex lookup and relevant architecture knowledge before planning; validate affected symbols in source. Determine the user goal, current behavior and acceptance criteria. Resolve routine choices from project conventions; ask only for decisions that materially block implementation.

Include: goal; current behavior; target behavior; affected files/modules; dependencies; architecture impact; data impact; API impact; UI impact; security impact; performance impact; testing strategy; implementation sequence; risks; rollback considerations. Mark non-applicable impacts explicitly and distinguish assumptions from evidence.

Order small reviewable changes by dependencies. Define behavioral verification for each stage, a failing regression test for known bugs, migration compatibility and rollback checkpoints. Delegate independent work only when supported and authorized by governing instructions, with explicit file ownership. Continue into authorized implementation rather than treating the plan itself as completion. Persist a plan only in the project's established planning location when useful.
