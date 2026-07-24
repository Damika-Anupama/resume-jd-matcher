# Frontend — Resume ↔ JD Keyword Coverage (public demo)

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4. This is the
**browser-local public demo**: matching, tiering, suggestions and file-to-text
extraction all run in the page. No resume or JD text is sent to any server.

## Scripts

```bash
npm ci               # install (use ci, not install, to respect the lockfile)
npm run dev          # dev server at http://localhost:3000
npm run build        # production build (output: standalone)
npm run lint         # eslint
npx tsc --noEmit     # typecheck
npm run test:e2e     # Playwright suite (builds + serves the standalone build)
npm run start:e2e    # serve an existing standalone build (used by Playwright)
```

`next start` is incompatible with `output: "standalone"`, so e2e serving goes
through `scripts/serve-e2e.mjs`, which colocates static assets with
`.next/standalone/server.js` and boots it in-process for Playwright's
`webServer`.

## Architecture

- `app/` — App Router pages and layout.
- `components/` — UI components (data-testids in these components form the
  stable contract the e2e suite targets).
- `lib/` — the browser-local matching engine: a TypeScript port of the Python
  reference (`backend/app/matching.py`) plus `skills.json`, the generated
  skill dictionary.
- `e2e/` — Playwright specs (see Testing).

### Parity with the Python matcher

The TypeScript engine must produce **byte-identical results** to the Python
reference. Three mechanisms keep them in lockstep:

1. `frontend/lib/skills.json` is generated from
   `backend/app/skills.json` by `scripts/sync-skills.mjs`; CI fails if the
   two drift (`node ../scripts/sync-skills.mjs --check`).
2. Shared contract fixtures (`backend/tests/fixtures/contract_cases.json`)
   run through both implementations; each case pins exact status, score and
   tier lists (see `docs/adr/0001-privacy-first-demo-contract.md`).
3. `e2e/matching-parity.spec.ts` asserts TS-side behaviour that is easy to
   get subtly wrong (round-half-to-even, sentence-scoped tier cues, evidence
   lines).

## Testing

Playwright runs two projects: `chromium` (1280×720 desktop) and
`mobile-chromium` (Pixel 7). Specs:

| Spec | Covers |
|---|---|
| `matcher.spec.ts` | smoke: controls render, manual + sample analysis, 320–1280px viewport matrix |
| `flows.spec.ts` | sample flow, insufficient-signal, validation, clear data, copy plan, download report |
| `accessibility.spec.ts` | axe-core scans (no serious/critical), 200% zoom, 320px reflow |
| `keyboard.spec.ts` | keyboard-only flow, skip link, focus management, visible focus indicators |
| `files.spec.ts` | .txt upload, 5 MB limit, corrupt/unsupported files |
| `storage-and-console.spec.ts` | sentinel text never reaches console or any browser storage |
| `matching-parity.spec.ts` | TS/Python engine parity |
| `privacy-local.spec.ts` | no network request carries user text |

```bash
npm run test:e2e                          # all projects
npx playwright test --project=chromium    # one project
E2E_BASE_URL=https://… npm run test:e2e   # against a deployed preview
```

All test data is synthetic (fictional personas, no real PII).

## Facts that trip people up

- This Next.js version may differ from your training data/habits — consult
  `node_modules/next/dist/docs/` before relying on framework behaviour.
- The public demo must stay local-only: adding any call that ships resume/JD
  text off-page will fail the privacy e2e specs by design.
