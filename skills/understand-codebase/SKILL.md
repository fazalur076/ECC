---
name: understand-codebase
description: "Investigate a repository as a staff engineer onboarding to it. Use for system explanation, repository understanding and real execution-flow tracing without changing application code."
---

# Understand Codebase

Do not modify application code. Start with healthy Cortex context lookup; fall back to targeted source search. Read architecture knowledge as a hypothesis, then verify in source. Inspect manifests and lockfiles for exact languages, frameworks, versions, runtime, package manager and build system; identify monorepo boundaries and deployment model.

Trace frontend/backend boundaries, modules, services, entry points, databases, queues, workers, schedulers, integrations, authentication, authorization, environment/configuration, state management, caching, design patterns, tests, CI/CD and infrastructure. Record absent or unknown components explicitly. Inspect environment variable names or example schemas without exposing secret values.

Follow at least one REAL execution path by symbol and call site: user interaction → frontend handler → API client → route → controller/service → repository/ORM → database → response → frontend state; or producer → queue/broker → consumer → processing → persistence → side effect. For a CLI or library follow invocation → dispatch → core logic → I/O → result. Cite file paths and symbols at each edge; mark dynamic dispatch or runtime assumptions unverified. Filenames alone are not architectural evidence.

Produce these sections with evidence and confidence: System Overview, Technology Inventory, Repository Map, Entry Points, Service/Module Map, Database Map, Integration Map, Authentication Flow, Important Request Flow, Background Processing, Configuration Model, Engineering Patterns, Top 10 Important Files (or all when fewer), Risks / Technical Debt, Onboarding Summary. Separate observed facts from inferred behavior and unanswered questions. If persistent knowledge is requested, hand the evidence to blueprint.
