---
name: performance
description: "Measure and improve backend or frontend performance. Use for latency, memory, query, rendering, bundle or throughput problems with evidence."
---

# Performance

Follow baseline → identify hot path → inspect queries/network/rendering → form hypothesis → optimize → benchmark → compare.

Define the user-visible metric, representative workload, environment, sample count and acceptable budget. Capture a baseline including variance; distinguish cold/warm runs and record tooling. Use profiles, traces, query plans or browser performance recordings to locate the actual bottleneck.

For backend work inspect query plans, N+1, indexes, batching, streaming, serialization, memory, concurrency and cache correctness. For frontend work inspect bundles, re-rendering, network waterfalls, virtualization, images, hydration and expensive computation. Choose the relevant subset rather than optimizing every category.

Make one causal change at a time. Preserve ordering, authorization, freshness, backpressure and failure behavior. Re-run the same benchmark under comparable conditions and relevant correctness tests. Report before/after values, variance, tradeoffs and regressions. If measurement tools or realistic workloads are unavailable, label changes as hypotheses and do not claim a speedup. Route meaningful UI changes through taste and structural changes through architecture-sync.
