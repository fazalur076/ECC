---
name: architecture-sync
description: "Incrementally update persistent architecture knowledge after meaningful changes to modules, APIs, data, auth, jobs, integrations or deployment."
---

# Architecture Sync

Run `ecc architecture status` and inspect the Git diff since the recorded baseline, including staged and unstaged changes. If the baseline is absent or invalid, establish a source inventory and disclose the wider review. Use Cortex for impact lookup when healthy; verify call sites in source.

Map changed files to the relevant architecture pages and diagrams. Trace changed execution edges, interface contracts, schema and security boundaries. Update only affected sections and their source evidence. Preserve user-authored sections and existing document ownership. Treat scaffolds and generated source inventories as pending investigation, not verified architecture.

Use `ecc architecture sync` for supported incremental metadata/scaffold maintenance; then fill affected knowledge from verified source. If Archify is configured, use its documented supported workflow and reuse its output rather than maintaining a parallel blueprint. Do not execute an unknown Archify command by guess.

Check links and diagram edges, record changed/unchanged pages and outstanding uncertainties, then recheck status. Do not mark stale or unverified pages verified simply because a command succeeded. No full regeneration for a one-file change unless its actual impact warrants it.
