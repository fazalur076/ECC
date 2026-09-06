# ECC project environment

ECC extends the existing CommonJS CLI with a project lifecycle. Install the
checkout with `npm install --global .`, enter a repository, and run `ecc`.
No compilation is required for the project CLI. Package preparation retains the
existing OpenCode build.

## Commands

| Command | Purpose |
| --- | --- |
| `ecc` | Setup in a new project; control center in an initialized project |
| `ecc init`, `ecc install` | Select agents and components, preview, confirm installation |
| `ecc status --json` | Read installed project state |
| `ecc doctor --json` | Validate manifest, owned files, routing, selected integrations |
| `ecc repair --yes` | Restore owned files, preserve backups, run doctor |
| `ecc update --yes` | Apply the installed CLI's canonical workflows, run doctor |
| `ecc uninstall --yes` | Remove unchanged ECC-owned files and instruction blocks |
| `ecc agents` | Configure agents interactively; list agents without a terminal |
| `ecc skills` | Configure components interactively; list the canonical registry otherwise |
| `ecc cortex status\|init\|sync\|rebuild\|doctor\|install` | Manage optional local repository intelligence |
| `ecc architecture init\|sync\|status` | Initialize, incrementally refresh, inspect blueprints |

Use `--agent claude`, `--agent cursor`, `--agent antigravity`, or `--agent codex`;
combine them with `--agents claude,cursor,codex`. `--all` selects every agent.
`--yes` authorizes project changes without an interactive confirmation.
`--dry-run` previews mutations. Noninteractive plain `ecc` never installs silently.

Select components with `--components router,engineering,architecture,design,taste,testing,review,security,performance,debugging`
or workflows with `--skills plan,fix,design-ui`. Dependencies include the router
and ensure that design workflows include Taste. Use `--cortex` to enable Cortex,
and `--no-cortex` to disable it.

`ecc update` refreshes project assets from the CLI version installed on your machine;
it does not fetch arbitrary upstream code. Install a reviewed newer ECC checkout
globally, then run `ecc update` in each project.

Legacy `ecc typescript`, `ecc install --profile … --target …`, `ecc-install`,
and lifecycle commands with `--target` retain their previous behavior and scopes.

## Agent adapters and workflow routing

The registry in `scripts/lib/project-registry.js` selects canonical content from
`skills/`. Supporting scripts, references, examples, and assets travel with each
skill. Adapters generate harness-specific routing without maintaining four source
copies.

| Agent | Project destinations |
| --- | --- |
| Claude Code | `.claude/skills/`, managed `CLAUDE.md` block |
| Cursor | `.cursor/skills/`, `.cursor/rules/ecc-router.mdc` |
| Antigravity | `.agents/skills/`, `.agents/rules/ecc-router.md` |
| Codex | `.agents/skills/`, managed `AGENTS.md` block |

Codex and Antigravity share installed skills. Only the small router is persistent;
other workflows load when relevant. These are agent instructions: compliance with
planning, review, and Taste is performed by the coding agent, not a background
process that intercepts or executes every request.

The router classifies task complexity, affected systems, architecture/UI impact,
testing, security, and performance. It requires investigation for bugs, evidence
for optimizations, and architecture sync after structural changes. Design work
uses audit/reference analysis where needed, implementation, Taste review and
revision, responsive/accessibility checks, and final rendered verification.

## Ownership and recovery

`.ecc/config.json` is a versioned manifest of selected agents, workflows,
integrations, and file ownership hashes. `.ecc/config.backup.json` supports
recovery from a damaged manifest. Neither stores secrets.

Shared instructions use `<!-- ECC:START -->` and `<!-- ECC:END -->`. Changes outside
these blocks survive update and uninstall. Unowned destination conflicts stop
installation before writes. Symlinked destinations and traversal paths are refused.
Modified owned files are backed up under `.ecc/backups/` before replacement;
uninstall preserves modified files. Backups and unrelated user files remain.
Review recovery backups before deleting them yourself.

Repeated initialization and updates stabilize: no duplicated skills, managed
blocks, or configuration entries. Doctor exits nonzero for critical failures;
repair runs it again after restoring owned assets.

## Cortex and Archify

Cortex is optional. ECC verifies its executable and supported command protocol,
queries version where supported, locates the project index, and checks doctor,
summary, search, and symbol lookup. An executable with the same name is insufficient.
The supported local Cortex CLI uses `init`, incremental `build`, and `build --full`.
ECC reports unavailable version information honestly. Source code, Git, tests,
compiler results, schemas, and runtime evidence remain authoritative.

Enable Cortex during setup or with `ecc init --cortex --yes`. Use
`ecc cortex sync --yes` for incremental indexing; rebuild only when needed.
If Cortex is missing, set `ECC_CORTEX_SOURCE` to a trusted local Cortex Go checkout
and run `ecc cortex install --yes`. ECC does not download or execute remote shell
installers. This installs a project-local executable, not global agent permissions.

Archify is detected when present. Automated invocation requires a verified
compatible protocol; where unavailable, ECC uses its own blueprints and preserves
existing architecture material.

## Persistent architecture

The architecture commands maintain `.architecture/` with system, stack, module,
entry-point, request-flow, database, auth, integration, background-job, frontend,
backend, deployment, and risk documents. Managed evidence is refreshed incrementally;
user-authored analysis remains intact.

Manifest-derived inventory is not a complete architecture analysis. Run the
`understand-codebase` workflow through your coding agent to trace a real execution
path and populate evidence-backed explanations. Unknowns must remain explicit.

## Validation and development

```bash
node --test tests/project/*.test.js tests/lib/project-*.test.js
npm test
npm run lint
npm run build:opencode
npm pack --dry-run
```

Tests use temporary fixture repositories. Exercise initialization, repeated updates,
damaged-file repair, and uninstall in a disposable repository before upgrading
important projects. No global installation is needed for development execution.
