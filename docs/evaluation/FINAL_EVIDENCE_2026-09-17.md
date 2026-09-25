# Final evidence and remaining acceptance work

Date: 17 September 2026. This record distinguishes fresh automated checks, earlier manual observations and unperformed checks.

## Implemented correction

Essential coverage now precedes weighted score in `compareScored`. The previous arithmetic argument failed across denominators: 2/3 + 0.10 exceeds 3/4. A focused regression and exhaustive comparison of the supported coverage fractions (one to five essentials) protect the intended priority. The weighted score remains available for explanations/debugging, but is not the primary global sorting key. Customer cards do not display it.

## Automated evidence

- 483 server tests passed, zero failed/skipped, on 17 September, excluding database integration files. The initial sandbox run could not open local test ports; the completed local-access run passed.
- The changed score suite contains 23 passing tests, including two new regression tests.
- Offline evaluation rerun: 14 authored scenarios, ten retrieval and four guardrail-only, 32/32 assertions passed. Headline Hit@1/3/5 remains 100/100/100% versus 20/50/70%; MRR 1.0000 versus 0.3994. No participant or commercial outcome is measured.
- Prior audit on 16 September: 19 read-only database integration tests, 224 mobile tests, mobile type check, 16 web tests and web build passed. Those counts are dated prior evidence, not newly repeated device acceptance.
- Raw server log retained alongside the dissertation revisions. No database-mutating integration suite was run in this revision.

## Read-only response times

Protocol specified before collection in `PERFORMANCE_PROTOCOL.md`; raw warm-ups, samples, environment and source hashes in `performance-results-2026-09-17.json`.

| Endpoint | Measured requests | Median ms | p95 ms | Failures |
|---|---:|---:|---:|---:|
| health | 50 | 1.452 | 1.748 | 0 |
| catalogue | 50 | 22.370 | 24.463 | 0 |
| recipes | 50 | 35.655 | 46.148 | 0 |

Five warm-ups preceded each endpoint's fifty samples. Nearest-rank percentiles include successful requests, with failures separately retained. All three endpoints met the exploratory local target of p95 under 1,000 ms and zero failures. This is warm single-client HTTP loopback timing, including body receipt, against the existing local SQL configuration. It excludes Wi-Fi, phone rendering, camera recognition, user time and concurrent store load. It is not a general responsiveness or scalability claim.

## Manual evidence and gaps

The 6 September record confirms partial account-list isolation, phone catalogue access, cashier camera lookup, successful validation and basket clearing. It does not establish final-version completeness. Later bilingual search was reported as working in the shared discussion; no new dated screenshot was collected here. The replacement `END_TO_END_VALIDATION.md` lists final device cases explicitly as pending.

Unknown/expired/reused/rejected QR cases still require a consolidated observation or dedicated end-to-end test. Automated recommendation reliability, quantity and role tests do not substitute for these cashier-session checks. No participant study, approval or participant dataset exists for this dissertation revision, as confirmed by the author. No usability scores are reported.

## Dissertation decisions

Target: adult supermarket shoppers in Tunisia using English or French. Chapters 1–6 form the main body. Chapter 5 includes results and discussion, and Chapter 6 conclusions. Title/abstract, bibliography and appendices are separate. Word limit remains unconfirmed. RQ4 addresses specified functional requirements and measured local API response time; RQ5 addresses developer assessment of task support/recovery, not participant usability.
