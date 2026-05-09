# Parser test fixtures

Real **May / June 2026** production `.xlsx` exports are intentionally **not committed**
(PII / operational privacy). CI and local runs work without them: Vitest specs that need
binaries **skip** when the expected file is missing.

To run the full integration suite locally, add files (exact names are referenced in
`tests/scheduleParserCore.spec.ts`):

- `may-2026-production.xlsx`
- `june-2026-production.xlsx`

Place them in this directory (`tests/fixtures/`). Do not commit them; keep them in
`.gitignore` if you copy samples here.
