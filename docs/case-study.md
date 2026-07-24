# Case study: a privacy-first resume ↔ JD keyword-coverage demo

## The user problem

Job seekers tailoring a resume to a posting have no quick, trustworthy way to
answer: *"which of the keywords this JD asks for does my resume actually
contain?"* Existing tools either charge for an opaque score, dress keyword
counting up as "ATS simulation" (a claim recruiters actively dispute), or
require uploading a resume — the most sensitive document most people own — to
an unknown server.

## Constraints

- **Honesty.** No ATS-simulation or hiring-prediction claims. The tool does
  one narrow thing (required-keyword coverage) and says so.
- **Privacy.** Resume text must never leave the browser in the public demo —
  no server calls, no storage, no logging, verifiable by tests.
- **Explainability.** Every point of the score must trace to a specific
  keyword and the resume line that evidenced it.
- **Zero run cost.** The public demo must be a static deployment with no
  API keys, backend or per-request cost.

## Architecture

Two layers, deliberately separated:

1. **Public demo** — a Next.js static frontend. The matching engine is a
   TypeScript port of the Python reference; file-to-text extraction also runs
   client-side. Nothing but static assets is served.
2. **Private full product** — a FastAPI service exposing the same engine
   (`/v1/analyze`, `/v1/extract`), an optional LLM suggestion layer, an
   optional Kafka + Redis async pipeline, Prometheus metrics, Docker,
   Kubernetes manifests and Terraform. This demonstrates production service
   architecture but is documented with its remaining gaps
   ([backlog.md](backlog.md)) rather than presented as finished.

A versioned contract (ADR 0001) pins the result schema (v2), the scoring
semantics, the negation filter and the summary strings so both
implementations are byte-identical, enforced by shared fixtures run through
both engines in CI.

## Why deterministic matching (not an LLM)

- **Auditability:** users can see exactly why the score is what it is; an LLM
  score cannot be explained or reproduced.
- **Privacy:** a local dictionary matcher needs no network; an LLM call would
  ship the resume off-device.
- **Cost and stability:** zero inference cost, identical output for identical
  input, testable to exact values.
- **Honesty:** a keyword check that admits to being a keyword check beats a
  keyword check wearing an AI costume.

The trade-off is recall: skills phrased outside the dictionary's aliases are
missed. The UI copy and the `insufficient signal` state are designed around
that limitation instead of hiding it.

## Privacy model

Local-only by default and enforced, not just promised: dedicated Playwright
specs type sentinel strings into the inputs and then assert the sentinel
never appears in any network request, console message, cookie, localStorage,
sessionStorage or IndexedDB record. "Clear data" wipes the ephemeral state.
Copy/download outputs (improvement plan, report) intentionally exclude the
raw resume text.

## Evaluation methodology — and its limits

The Python engine is scored by a harness against 20 synthetic, hand-labelled
resume/JD pairs. Because the dataset was authored with the same taxonomy the
engine uses, the metrics measure **agreement with the taxonomy's own
labels**, not real-world quality; they exist to catch regressions (they are
pinned as pytest assertions in CI), not to advertise accuracy. Real-world
performance is unmeasured until a dataset of genuine postings/resumes exists
— that work is on the backlog.

## Testing strategy

- Unit + contract tests on both engines, with shared fixtures as the parity
  gate.
- Playwright e2e on desktop and mobile Chromium: user flows,
  insufficient-signal, validation, clear-data, copy/download, file-upload
  edge cases (size limit, corrupt files, unsupported types).
- Accessibility as a gate: axe-core scans (no serious/critical violations),
  full keyboard-only operation, visible focus indicators, 200% zoom, no
  horizontal overflow at 320px.
- Privacy as a gate: the no-leak specs described above.

## Deployment and supply chain

Static frontend deployment (no server to secure or pay for). CI is
least-privilege GitHub Actions with every third-party action pinned to a
commit SHA, dependency audit lanes (npm audit, pip-audit), CodeQL for both
languages, Dependabot, and IaC validation (terraform validate, kubeconform,
Checkov — versions pinned) for the private product's deploy configs.

## What I could build for a client

The same shape applies to many business problems: a small deterministic core
with an honest contract, a private-by-default UI, parity-tested across
languages, accessibility and privacy enforced by CI rather than by promise.
Examples: intake-form triage, document checklist verification, compliance
keyword screening, quote/estimate calculators. If that is the kind of tool
you need, contact me via [github.com/Damika-Anupama](https://github.com/Damika-Anupama).
