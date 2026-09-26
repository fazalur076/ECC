---
name: ecc-router
description: "Route ordinary engineering requests to the smallest appropriate installed ECC workflow. Apply for each project request; slash commands are optional."
---

# Ecc Router

Read `.ecc/config.json` to discover installed workflows and integrations. Load only the selected skill bodies, resolving names through the current agent's installed skill directory. Do not assume optional skills or tools are installed. If a workflow is absent, use its intent with available capabilities and report the limitation; do not silently install tools.

## Context before routing

1. Classify the requested outcome, scope, risk, and whether code or UI changes are authorized.
2. For symbols, references, callers, routes, dependencies, impacted files and search, prefer Cortex when `ecc cortex status` reports a healthy index. Compare index state to current Git state, including uncommitted work; sync incrementally when appropriate. If unavailable, stale or failing, use targeted source search.
3. Read relevant `.architecture/` pages or the configured Archify equivalent. Verify their claims against actual source. Source, compiler, type checker, tests, runtime, Git, schema and logs are authoritative.
4. Choose the smallest workflow below. Do not force planning, architecture generation or full security review onto a typo or harmless cosmetic edit.

## Natural-language routing

| Request intent | Workflow |
| --- | --- |
| Explain this repository; onboard me; trace a request | understand-codebase |
| Persist the system map; create an architecture blueprint | blueprint |
| Choose service boundaries; assess a migration | architecture, then plan if implementation is complex |
| Coordinate multiple agents, worktrees, branches, or an implementation/review handoff | chief-of-staff, team-agent-orchestration |
| Add a feature across modules; migrate an API | plan, tdd-workflow, code-review |
| This crashes; fix this regression | fix, tdd-workflow, code-review |
| Review this change | code-review |
| Auth, permissions, secrets, uploads, exposed endpoint | security-review in addition to the main workflow |
| Slow endpoint, high memory, slow rendering | performance |
| Build or redesign a screen | ui-audit if existing, design-ui, taste |
| Audit an interface | ui-audit; design-ui only if implementation requested |
| Use this screenshot or reference site | ui-reference, then design-ui if requested |
| Animate this interaction | motion-ui, taste |
| Product viewer or spatial interaction | 3d-ui, taste |
| Consolidate tokens and components | design-system, taste |

## Completion gates

For meaningful UI work use context → audit existing UI → design-ui → implementation → taste → automatic revision on failure → responsive check → accessibility check → final visual verification. Taste is a reviewer, never a substitute generator. Do not claim a visual pass without rendered evidence.

After meaningful changes to boundaries, interfaces, data, auth, integrations, jobs or deployment, run or recommend architecture-sync. Update only impacted knowledge. For code changes inspect the diff, run focused validation and review risk. Report evidence, unresolved limitations and the concrete result. Never read secret values into prompts, change global permissions or execute remote installers as a routing side effect.
