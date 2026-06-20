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
| Eventing | Kafka (Redpanda locally) via confluent-kafka — async analysis queue |
| Testing | Playwright (E2E), pytest, deterministic eval harness, real broker integration test |
| Infra / DevOps | Docker (multi-stage), Kubernetes (manifests + HPA + NetworkPolicy), Terraform, checkov, kubeconform |

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

### Event-driven async path (Kafka)

For higher throughput the same analysis runs asynchronously through a
Kafka-compatible broker (Redpanda locally):

```
POST /analyze/async            -> { "job_id": "…", "status": "queued" }  (202)
   → produces a job to the `analysis-requests` topic
   → a consumer worker (app/worker.py) processes it and stores the result
GET  /analyze/status/{job_id}  -> { "status": "queued|processing|done", "result": … }
```

Run the full stack locally with Redpanda + API + worker:

```bash
docker compose -f deploy/docker-compose.yml up --build
```

The producer/consumer code (`app/events.py`) uses `confluent-kafka`, so it runs
unchanged against managed Kafka (MSK, Confluent Cloud, Redpanda Cloud) in
production. A **real produce→consume integration test**
(`tests/test_events_integration.py`) spins up Redpanda in Docker and verifies the
round trip end-to-end; it is skipped automatically when Docker is unavailable.

> The demo job store is in-memory. For multi-process/scale-out deployments,
> back it with Redis or a database so state is shared across workers. A single
> process can serve the full async demo with `RUN_INPROCESS_CONSUMER=1`.

## Deployment

The `frontend/` app deploys to Vercel as a standard Next.js project (root
directory `frontend`). No environment variables are required for the
self-contained demo.

### Kubernetes / Terraform (production topology)

For a container-orchestrated deployment, `deploy/` contains full
infrastructure-as-code — production Dockerfiles for both services, Kubernetes
manifests (Deployments, Services, Ingress, HPAs, NetworkPolicies), and an
equivalent Terraform configuration using a reusable module. It is validated in
CI with `terraform validate`, `kubeconform`, and `checkov` (k8s **183/183**,
terraform **57/57** passing). See [`deploy/README.md`](deploy/README.md).

```bash
# Validate all IaC locally (no cloud account or cluster needed)
bash deploy/scripts/validate.sh

# Deploy to any cluster (kind/minikube/EKS/GKE)
kubectl apply -f deploy/k8s/
```

## Author

**Damika Anupama Nanayakkara** — [Portfolio](https://damika.is-a.dev/) · [GitHub](https://github.com/Damika-Anupama) · [LinkedIn](https://www.linkedin.com/in/damika-anupama)

## License

MIT
