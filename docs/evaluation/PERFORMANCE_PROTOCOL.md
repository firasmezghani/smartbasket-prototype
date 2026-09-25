# Read-only response-time protocol

Specified before measurement on 17 September 2026. Run from server: `node scripts/benchmark-readonly.mjs`.

- Fresh instance of the production Express application with normal middleware and current source, bound only to loopback. Existing local SQL configuration. No database writes.
- GET health; catalogue first page (20 products); recipes (10 requested), using the existing prototype test customer 1 for read-only evidence. Do not report identity or basket payloads.
- Five warm-up requests excluded from summaries, then 50 measured requests for each endpoint, sequentially at concurrency one. Timing covers request through complete body receipt. Timeout ten seconds. Recipe requests have a 2.3-second pause, preserving the normal 30/minute limit.
- Save every duration/status, warm-ups separately, environment and recipe/scorer hashes. Median and p95 use nearest-rank successful-request durations; count every failed measured request separately. No retries or failure removal from the denominator.
- Exploratory local target: p95 below 1,000 ms and zero failures. This engineering target was specified for this experiment, not derived from participant research or a university standard.
- This is a warm, single-client, loopback experiment. It excludes camera time, rendering, phone Wi-Fi, human interaction, concurrent load and payment. Do not infer real-store or production performance.
