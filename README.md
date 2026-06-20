# Resume ↔ JD Matcher

> An applied-LLM tool that scores how well a **resume** fits a **job description**,
> extracts matched & missing skills, and generates tailored, LLM-assisted
> suggestions to close the gaps.

Built to demonstrate an end-to-end applied-LLM workflow: **API + UI + evaluation + deployment** — provider-agnostic, with a deterministic mock mode so it runs anywhere with zero secrets.

## Why this exists

The structured score (fit %, matched/missing skills) comes from a **deterministic
matching engine**, so results are reproducible and testable. A **real LLM**
(via OpenRouter) layers natural-language tailoring suggestions on top — but only
when configured. With no API key the app falls back to deterministic,
template-based suggestions, so the UI, tests, and deploys all work offline.

## Architecture

```
┌──────────────────────────┐         ┌─────────────────────────────┐
│  Next.js + TypeScript UI │  POST   │  /api/analyze (route handler)│
│  resume + JD textareas   ├────────►│  deterministic matcher (TS)  │
│  fit ring · skills · tips │  JSON   │  → fit, matched/missing, tips│
└──────────────────────────┘         └─────────────────────────────┘

         ── plus a full Python service for the LLM-powered path ──

┌──────────────────────────────────────────────────────────────────┐
│  FastAPI backend                                                  │
│  • POST /analyze  → deterministic score + provider suggestions    │
│  • GET  /metrics  → Prometheus (requests, latency, fit_score,     │
│                     analyses_total{provider})                     │
│  • app/llm_client → mock | openrouter (env-selected, key from env)│
│  • app/evaluate   → golden-set evaluation harness                 │
└──────────────────────────────────────────────────────────────────┘
```

The Next.js deployment is **self-contained** (matching runs in a route handler),
so the live demo needs no backend and no API key. The FastAPI service is the
reference implementation of the same contract, plus observability and the
real-LLM provider.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, Pydantic, prometheus-client |
| LLM | OpenRouter (provider-agnostic client; deterministic mock fallback) |
| Testing | Playwright (E2E), pytest, deterministic eval harness |

## Quick start

### Frontend (self-contained demo)

```bash
cd frontend
npm install
npm run dev            # http://localhost:3000
npm run build && npm start
npm run test:e2e       # Playwright E2E (no API key needed)
```

### Backend (full service + LLM path)

```bash
cd backend
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# Run the API (mock provider by default — no key required)
uvicorn app.main:app --reload --port 8000

# Tests + lint + evaluation
pytest -q
ruff check app tests
python -m app.evaluate        # prints golden-set accuracy
```

### Enabling the real LLM provider

The LLM path is **off by default** (deploy-safe). To enable it, set:

```bash
export LLM_PROVIDER=openrouter
export OPENROUTER_API_KEY=sk-or-...     # never commit this
export LLM_MODEL=openai/gpt-4o-mini     # optional, this is the default
```

With these set, `/analyze` returns suggestions from a real model and the
response's `provider` field reads `openrouter`. If the LLM call fails, the
service falls back to deterministic suggestions and labels the provider
`mock (openrouter fallback)` — it never fails the request.

## Evaluation

Recruiters for applied-LLM roles expect **evaluation**, not just a model call.
`app/evaluate.py` scores the deterministic core against a golden set of
`(resume, jd, expected)` cases and reports accuracy; it's also asserted in the
test suite (`pytest`).

## API

`POST /analyze`

```json
{ "resume": "…", "job_description": "…" }
```

returns

```json
{
  "fit_score": 50,
  "matched_skills": ["react", "typescript"],
  "missing_skills": ["kubernetes", "terraform"],
  "extra_skills": ["redis"],
  "summary": "Partial match: the resume covers 2 of 4 required skills (50%).",
  "suggestions": ["Add concrete evidence of kubernetes …"],
  "provider": "mock"
}
```

## Deployment

The `frontend/` app deploys to Vercel as a standard Next.js project (root
directory `frontend`). No environment variables are required for the
self-contained demo.

## Author

**Damika Anupama Nanayakkara** — [Portfolio](https://damika.is-a.dev/) · [GitHub](https://github.com/Damika-Anupama) · [LinkedIn](https://www.linkedin.com/in/damika-anupama)

## License

MIT
