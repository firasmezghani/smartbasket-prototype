# Testing checklist

Database safety update: use [DATABASE_HANDOVER.md](DATABASE_HANDOVER.md) as the current entry point. Cart concurrency and cashier integration tests require explicit disposable-database opt-in and verify the actual connected database. Private-catalogue read-only suites are separately opt-in. A skipped test is not acceptance evidence. Do not run the old cashier database reset helper or the isolated API verifier against the working demo.

Current testing entry for the finished SmartBasket prototype. This file does
**not** invent new verification results. Dated observations and benchmarks live
under `docs/evaluation/` and in the acceptance table below.

## Commands (local)

From the repository root, after dependencies are installed:

```bash
npm test --prefix server
npm test --prefix client
npm test --prefix mobile
npm run typecheck --prefix mobile
npm run build --prefix client
npm run evaluate:recommendations --prefix server
```

Demonstration API (does not replace the commands above):

```bash
npm run demo:server
```

See [README.md](../README.md) and
[DATABASE_HANDOVER.md](DATABASE_HANDOVER.md).

## How to read evidence

| Kind | Meaning |
| --- | --- |
| Automated package tests | Reproducible `npm test` / typecheck / build / offline evaluation runs |
| Dated evaluation artefacts | JSON/CSV/reports under `docs/evaluation/` with an explicit date |
| Observed interactions | Manual or device checks recorded with a date in acceptance or evaluation notes |
| Pending | Explicitly not claimed as done |

Do not tick a pending acceptance case from a source review alone. Do not treat
full-import audit folders as `SmartBasketDemo` setup instructions.

## Current acceptance entry

Primary manual acceptance cases:
[END_TO_END_VALIDATION.md](END_TO_END_VALIDATION.md).

What was verified on 17 September 2026 (automated scores, response-time
protocol, manual gaps):
[evaluation/FINAL_EVIDENCE_2026-09-17.md](evaluation/FINAL_EVIDENCE_2026-09-17.md).

Index of evaluation folders (recommendation results, performance JSON,
screenshots, catalogue audits):
[evaluation/README.md](evaluation/README.md).

Database setup and the 91/164/91 verification are in
[DATABASE_HANDOVER.md](DATABASE_HANDOVER.md).
