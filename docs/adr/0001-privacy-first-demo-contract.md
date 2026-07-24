# ADR 0001 — Privacy-first demo: shared match-result contract (v2)

Status: Accepted — 2026-07-24
Deciders: Agent 1 (integration lead), with Agents 3 (frontend contract) and 4 (matching engine)

## Context

The public demo must report **required-keyword coverage** as the primary score,
report nice-to-have coverage separately, never treat negated text as evidence,
and run **entirely in the browser by default**. The previous `fit_score`
divided matched skills by *all* recognised JD skills (required + optional),
which contradicted the UI copy ("required-skill coverage"). This ADR versions
the contract to v2 and documents the deliberate semantic change.

**Breaking change (documented, versioned):** `fit_score` now means
*required-keyword coverage* — `round_half_even(100 * |required ∩ resume| / |required|)`.
Nice-to-have terms never appear in the denominator. Consumers can detect v2 via
`schema_version`.

## Result schema v2 (normative — identical in Python and TypeScript)

```jsonc
{
  "schema_version": 2,
  "status": "ok" | "insufficient_signal",
  "fit_score": 0,                    // int 0..100 = REQUIRED coverage; 0 when insufficient_signal (UI must not render it as a score then)
  "required_matched": ["..."],       // sorted
  "required_missing": ["..."],       // sorted
  "nice_to_have_matched": ["..."],   // sorted
  "nice_to_have_missing": ["..."],   // sorted
  "matched_skills": ["..."],         // legacy union (all matched JD skills), sorted
  "missing_skills": ["..."],         // legacy union, sorted
  "extra_skills": ["..."],           // resume skills not in JD, sorted
  "required_skills": ["..."],        // legacy tier list, sorted
  "nice_to_have_skills": ["..."],    // legacy tier list, sorted
  "summary": "...",
  "evidence": { "skill": "resume snippet" },  // only from non-negated segments
  "suggestions": ["..."],            // 0..5 non-empty strings, see composition rules
  "provider": "deterministic"        // never "mock" in user-visible output
}
```

### Status rules

- `insufficient_signal` when the recognised **required** list is empty — i.e.
  no JD skills recognised at all, OR every recognised JD skill is nice-to-have.
  Nice-to-have coverage is still reported when present.
- Otherwise `ok`.

### Summary strings (byte-identical in both languages)

- ok: `"{band}: the resume covers {m} of {n} required keywords ({fit}%)."`
  where band = `Strong coverage` (fit ≥ 80), `Partial coverage` (fit ≥ 50),
  else `Low coverage`.
- insufficient, no JD skills at all:
  `"No recognised skill keywords were found in the job description, so a coverage score was not computed."`
- insufficient, only nice-to-have skills:
  `"The job description lists only nice-to-have keywords, so a required-coverage score was not computed."`

### Suggestion composition (normative order; cap 5; never encourage fabrication)

If `status == "insufficient_signal"` → `suggestions: []` (UI shows guidance state).
Otherwise, in order:

1. For each of the first **3** `required_missing` skills:
   `"If you genuinely have {skill} experience, add a concrete example — a project, metric, or responsibility that shows hands-on use."`
2. If `nice_to_have_missing` non-empty (one aggregated item):
   `"Optional keywords not found: {comma-joined list}. Only add one if you can support it truthfully."`
3. If `required_missing` is empty:
   `"All recognised required keywords are covered — emphasise depth and impact (metrics, scale, ownership) for your matched skills."`
4. If `matched_skills` non-empty:
   `"Lead with your strongest matched skills ({first ≤3, comma-joined}) near the top of the resume so they are seen first."`

Max possible = 3 + 1 + 1 = 5 (rule 3 excludes rule 1). Never emit
"Strong coverage" language for insufficient signal.

## Negation / non-experience filter (normative)

Applies to **resume** text only (JD-side negation is a documented limitation).

1. Segment the resume with the same splitter used by tier classification:
   `\r\n | \r | \n | (?<=[.;!])\s+`.
2. A segment is **non-evidence** if its lowercased text matches ANY of
   (identical pattern list in Python and TS, case-insensitive):
   - `\bno\s+(?:[a-z0-9.+#/-]+\s+){0,3}(?:experience|exposure|knowledge|background)\b`
   - `\bwithout\s+(?:[a-z0-9.+#/-]+\s+){0,3}(?:experience|exposure|knowledge)\b`
   - `\bnever\s+(?:used|worked|written|deployed|touched)\b`
   - `\bnot\s+(?:familiar|experienced|proficient|comfortable|skilled)\b`
   - `\bunfamiliar\s+with\b`
   - `\black(?:s|ing)?\s+(?:of\s+)?(?:experience|knowledge|exposure)\b`
   - `\b(?:want|wants|hope|hopes|hoping|plan|plans|planning|aspire|aspires|aspiring|eager|keen|willing)\s+to\s+learn\b`
   - `\b(?:currently|still)\s+learning\b`
   - `\binterested\s+in\s+learning\b`
3. A resume skill counts as present iff ≥1 mention occurs in a segment that is
   NOT non-evidence. `evidence` snippets come only from such segments.
4. Documented limitations: years-of-experience, proficiency level, recency,
   scope ("not only … but also") are NOT modelled.

## Taxonomy corrections (backend/app/skills.json is the single source of truth)

- Split `html/css` → `html: ["html", "html5"]` and `css: ["css", "css3", "scss", "sass"]`.
- Split `pandas` → `pandas: ["pandas"]` and `numpy: ["numpy"]`.
- Review remaining conflations (e.g. `terraform` claiming generic "iac",
  `kafka` claiming "event-driven", `llm` claiming vendor names) — Agent 4 may
  tighten with judgment; no alias may map two unrelated tools to one canonical
  skill, and no parent/alias pair may double-count one mention.
- `frontend/lib/skills.json` stays generated via `scripts/sync-skills.mjs`.

## Shared fixtures (parity gate)

- Canonical file: `backend/tests/fixtures/contract_cases.json` (Agent 4 authors),
  array of `{ name, resume, jd, expect }` where `expect` includes exact
  `status`, `fit_score`, `required_matched`, `required_missing`,
  `nice_to_have_matched`, `nice_to_have_missing`, and optionally exact
  `suggestions`, `summary`, `evidence_keys`.
- Synced to the frontend by `scripts/sync-skills.mjs` (extended to also copy
  fixtures); CI fails on drift.
- Python runner: `backend/tests/test_contract_fixtures.py`.
- TS runner: extend `frontend/e2e/matching-parity.spec.ts` (or a node runner)
  to execute every fixture through `computeMatch` and assert identical output.
- Must include the canonical regression: JD "Required: Python. Nice to have:
  Kubernetes, Terraform." + resume "Python developer." → status ok,
  fit_score 100, nice_to_have_missing = [kubernetes, terraform].

## Error schema (API routes, private full product)

`{ "error": string, "code": string }` with correct HTTP status propagated
end-to-end (400/401/413/422/429 from the backend must surface as-is — never a
silent local-success fallback; local fallback is allowed ONLY for network
failure / 5xx). All API responses set `Cache-Control: no-store`. 20,000-char
limits enforced before matching; 5 MB file limit enforced before buffering.

## Privacy modes

- `local` (public demo default and ONLY mode in the public build): analysis and
  file parsing run in the browser; no resume/JD byte may reach any network
  endpoint, storage API, cookie, or console. "Clear data" wipes ephemeral state.
- Cloud/LLM assist stays in the private product only, behind explicit opt-in
  consent, with PII minimisation — out of scope for the public demo build.

## File ownership (Phase 2)

- Agent 2: `frontend/app/page.tsx|layout.tsx|globals.css`, `frontend/components/**`, UI assets.
- Agent 3: `frontend/lib/**`, `frontend/workers/**`, `frontend/app/api/**`, frontend deps/lockfile.
- Agent 4: `backend/**`, `backend/tests/fixtures/**`, `scripts/sync-skills.mjs`.
- Agent 5: `frontend/e2e/**`, `frontend/playwright.config.ts`, `.github/**` (except mirror workflow), `README.md`, `frontend/README.md`, `docs/**` (except this ADR), `product/demo_script_60s.md`.
- Agent 1: integration, mirror/publish workflow, GitHub/Vercel mutations.

Integration order: contracts+matcher (4) → browser-local processing (3) →
product UI (2) → CI/security (5) → docs/screenshots (5) → full validation.
