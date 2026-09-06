---
name: code-review
description: "Review code and diffs for actionable correctness, regression, architecture, security and performance defects. Use for PR review or after meaningful implementation."
---

# Code Review

Read the requested diff and affected execution paths, contracts and callers, not just changed lines. Compare with project conventions and tests. Review correctness, regression risk, edge cases, architecture consistency, API contracts, state-management bugs, async issues, resource leaks, error handling, duplicate logic, unnecessary complexity, maintainability, test coverage, performance and actual security-sensitive concerns.

For each finding give severity, file and line/symbol, a concrete triggering scenario, impact and smallest correction. Distinguish confirmed defects from hypotheses requiring runtime evidence. Prioritize critical/high findings; skip formatting that formatters enforce and speculative findings without a plausible path. Use security-review for actual attack surfaces and performance for claims requiring measurement.

Run focused checks where practical. Report no findings when justified, together with tests performed and residual coverage gaps. For authorized implementation fix significant findings and repeat the affected check; for review-only requests report findings without altering code. Do not infer test success from reading tests.
