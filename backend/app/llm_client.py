"""Provider-agnostic LLM client for resume ↔ JD analysis.

Design goals:
- **Deploy-safe by default:** with no API key the app uses a deterministic
  `mock` provider, so the UI, tests, and previews all work offline.
- **Genuinely LLM-powered when configured:** set `LLM_PROVIDER=openrouter` and
  `OPENROUTER_API_KEY` to get natural-language tailoring suggestions from a real
  model, layered on top of the deterministic structured score.

The structured score (fit %, matched/missing skills) always comes from the
deterministic engine in `matching.py`, so results are reproducible and the LLM
is only responsible for the human-readable suggestions.
"""
from __future__ import annotations

import json
import os
import urllib.request
import urllib.error

from app.matching import compute_match, MatchResult

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = os.environ.get("LLM_MODEL", "openai/gpt-4o-mini")


def active_provider() -> str:
    """Resolve the active provider from the environment.

    Returns "openrouter" only when explicitly selected AND a key is present;
    otherwise "mock".
    """
    provider = os.environ.get("LLM_PROVIDER", "mock").lower()
    if provider == "openrouter" and os.environ.get("OPENROUTER_API_KEY"):
        return "openrouter"
    return "mock"


def _mock_suggestions(result: MatchResult) -> list[str]:
    """Deterministic, template-based tailoring suggestions (no network)."""
    suggestions: list[str] = []
    for skill in result.missing_skills[:5]:
        suggestions.append(
            f"Add concrete evidence of {skill} — a project, metric, or "
            f"responsibility that demonstrates hands-on use."
        )
    if not result.missing_skills:
        suggestions.append(
            "Strong coverage — emphasise depth and impact (metrics, scale, "
            "ownership) for the matched skills rather than adding new ones."
        )
    if result.matched_skills:
        top = ", ".join(result.matched_skills[:3])
        suggestions.append(
            f"Lead with your strongest matched skills ({top}) near the top of "
            f"the resume so they are seen first."
        )
    return suggestions


def _openrouter_suggestions(result: MatchResult, resume: str, jd: str) -> list[str]:
    """Ask a real LLM (via OpenRouter) for tailoring suggestions.

    Raises on any network/parse error so the caller can fall back to mock.
    """
    api_key = os.environ["OPENROUTER_API_KEY"]
    prompt = (
        "You are a concise technical resume coach. Given a job description, a "
        "candidate resume, and a structured skill-gap analysis, return 3-5 "
        "specific, actionable suggestions to improve the resume's fit. "
        "Return ONLY a JSON array of strings.\n\n"
        f"JOB DESCRIPTION:\n{jd[:4000]}\n\n"
        f"RESUME:\n{resume[:4000]}\n\n"
        f"GAP ANALYSIS:\n{json.dumps(result.to_dict())}\n"
    )
    payload = {
        "model": DEFAULT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
    }
    req = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    content = data["choices"][0]["message"]["content"].strip()
    # Tolerate models that wrap JSON in markdown fences.
    if content.startswith("```"):
        content = content.strip("`")
        content = content[content.find("[") :]
    parsed = json.loads(content)
    if not isinstance(parsed, list):
        raise ValueError("LLM did not return a JSON array")
    return [str(s) for s in parsed][:5]


def analyze(resume_text: str, jd_text: str) -> dict:
    """Run the full analysis: deterministic score + provider suggestions.

    Always returns a dict with the structured score plus `suggestions` and the
    `provider` actually used (so the UI can show whether it was LLM or mock).
    """
    result = compute_match(resume_text, jd_text)
    provider = active_provider()

    if provider == "openrouter":
        try:
            suggestions = _openrouter_suggestions(result, resume_text, jd_text)
        except (urllib.error.URLError, KeyError, ValueError, TimeoutError):
            # Honest fallback: never fail the request because the LLM is down.
            suggestions = _mock_suggestions(result)
            provider = "mock (openrouter fallback)"
    else:
        suggestions = _mock_suggestions(result)

    payload = result.to_dict()
    payload["suggestions"] = suggestions
    payload["provider"] = provider
    return payload
