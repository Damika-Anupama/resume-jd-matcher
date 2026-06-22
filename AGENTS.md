# AGENTS.md — resume-jd-matcher

Rules for AI coding agents working in this repo. Keep changes small and verifiable.

## Architecture (read before editing)
- `frontend/` — Next.js 16 + React 19 + TS. The `/api/analyze` route runs the deterministic matcher, so the demo is self-contained (no backend, no API key needed).
- `backend/` — FastAPI reference service: deterministic score + provider suggestions, `/metrics` (Prometheus), env-selected LLM client (`mock` | `openrouter`), golden-set eval harness.
- The matcher contract is shared by both; keep frontend `/api/analyze` and backend `/analyze` behaviourally aligned.

## Rules
1. **Think before coding** — state your interpretation; surface tradeoffs; push back when something is wrong.
2. **Simplicity first** — minimum code that solves the real problem; no speculative abstraction.
3. **Surgical changes** — touch only what the request needs; don't rewrite code you don't understand.
4. **Verifiable** — turn "fix the bug" into a failing test, then make it pass.
5. **No silent error-skipping** — surface real failures; never degrade a failure into a softer status.
6. **Secrets stay in env** — never commit API keys. The app must keep working in `mock` mode with zero secrets.
7. **Match existing style** — Ruff for Python, ESLint for TS; run them before pushing.

## Verify before opening a PR
- Backend: `cd backend && ruff check . && pytest -q`
- Frontend: `cd frontend && npm run lint && npm run build`
- CI (`.github/workflows/ci.yml`) runs all of the above on every PR to `main`.
