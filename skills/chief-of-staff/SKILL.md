---
name: chief-of-staff
description: "Coordinate parallel engineering work across Codex, Antigravity, Gemini, or other agents using ECC workflows, task-specific Git worktrees, evidence gates, and human approval. Use when a feature needs planning, delegation, implementation handoffs, independent review, and a merge-ready report."
metadata:
  origin: ECC
---

# Chief of Staff

Coordinate delivery; do not replace specialist engineering judgment. Use `team-agent-orchestration` for work-item ownership and gates, `plan` to shape a feature, and `code-review` for independent review.

## Before dispatch

1. Read the repository's `AGENTS.md`, installed ECC router, relevant architecture records, and its current Git status.
2. Route the request through `ecc-router`. Load only the workflows needed for each task.
3. When Cortex is healthy, use it for discovery and run impact analysis before changing shared behavior, APIs, models, permissions, or reusable UI.
4. Write a short plan: acceptance criteria, task boundaries, dependencies, risks, verification, and merge gates.

## Delegate safely

- Split only independent work. Start with two implementation tasks and a separate review task.
- Create one task-specific branch and worktree per implementation task, for example `agent/backend-booking-rules` and `agent/frontend-booking-rules`.
- Give every agent its objective, acceptance criteria, assigned worktree, permitted scope, relevant architecture records, ECC workflow, and required verification.
- No agent may edit another worktree, push, merge, deploy, release, reset, or discard changes without explicit human approval.
- A coordinator prompt does not automatically start another harness. Create each Codex, Antigravity, Gemini, or other agent session in the appropriate host, then provide its task brief.

## Handoff and review

Each implementation handoff must report: objective; branch and worktree; ECC workflows used; files and commits; commands/tests run and outcomes; contract changes; assumptions; risks; and follow-ups.

An independent reviewer inspects the implementation branch against its base with ECC `code-review`. Add `security-review` for authentication, authorization, secrets, payments, uploads, sensitive data, or externally exposed endpoints. For meaningful UI work require `design-ui` and a rendered ECC Taste review.

Require focused tests, applicable CI-equivalent checks, and resolved review findings before calling a change PR-ready. Report evidence and outstanding risks, then wait for explicit human approval before push, PR creation, merge, deployment, or release.
