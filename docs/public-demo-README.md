# Resume ↔ JD Matcher — private, browser-local keyword coverage

**Live demo:** https://resume-jd-fit-demo.vercel.app <!-- verified at release; updated if the final domain differs -->

Paste a resume and a job description and see which **required** keywords the
resume covers — and exactly which are not found — with the resume line behind
every match. Everything runs in your browser: no signup, no upload, nothing
stored, no network request carries your text.

## What it is — and is not

- ✅ A transparent, deterministic **keyword-coverage** check with evidence.
- ✅ Private by construction: analysis and file parsing happen on this page.
- ❌ Not an ATS simulator, a hiring prediction, or an assessment of ability.
- ❌ It cannot tell you why a specific application was rejected.

The score is `matched required keywords ÷ total required keywords`.
Nice-to-have keywords are reported separately and never change the score.
Negated text ("no Kubernetes experience") is never counted as evidence.
Only add a skill to your resume when you can support it truthfully.

## Running locally

```bash
npm ci
npm run dev        # http://localhost:3000
npm run test:e2e   # Playwright: flows, a11y (axe), keyboard, privacy checks
```

## How it works

A compact skill dictionary (canonical names + aliases) drives token-aware
extraction; job-description lines are tiered into required vs nice-to-have
from cue phrases; a negation filter drops non-experience mentions; the result
is rendered with the matching resume line as evidence. The matcher is pure
TypeScript (`lib/matching.ts`) with shared contract fixtures
(`lib/contract-cases.json`) that pin its behavior.

Known limitations: dictionary-bounded skills, English cue words only, no
modelling of years, proficiency, or recency.

This public repository contains the client-side demo only. It is published
from a private full-stack workspace (FastAPI backend, evaluation harness, and
infrastructure) through an allowlisted, leak-gated pipeline.

---

Built by [Damika Anupama](https://github.com/Damika-Anupama).
Need a tailored workflow like this for your business? Reach out via GitHub.
