# Evaluation — what the numbers mean (and what they don't)

The evaluation harness lives in `backend/app/evaluate.py` over the labeled
dataset in `backend/app/eval_dataset.py`. Run it with:

```bash
cd backend && python -m app.evaluate          # human-readable report
cd backend && python -m app.evaluate --json   # machine-readable
```

## Current numbers (v2 contract, 31 labeled pairs)

| Metric | Value |
| --- | --- |
| Skill-extraction precision | 1.000 (tp=237, fp=0) |
| Skill-extraction recall | 0.992 (fn=2) |
| Skill-extraction F1 | 0.996 |
| Fit-score mean absolute error | 0.65 pts (29 scorable pairs) |
| Fit-band accuracy (strong/partial/weak/unscorable) | 1.000 (31/31) |
| Behavioural golden set | 8/8 |

The two false negatives are the same known limitation: a resume that writes
bare "Go" for the Go language is not extracted, because the two-letter English
word cannot be matched without false positives ("go to market"); `golang` is
the reliable alias.

## How the dataset was constructed — read this before quoting any number

- **Fully synthetic.** Every resume and JD was written by the project author
  for this harness. No real resumes, names, or employers. Typical pairs are a
  few sentences long — far cleaner than real documents.
- **Author-aligned.** The same person wrote the matcher, the texts, and the
  gold labels, and labels only use skills the dictionary is *capable* of
  recognising. This measures alias coverage and boundary handling against the
  author's own reading — it cannot surface vocabulary the dictionary lacks,
  and it is structurally biased toward high scores.
- **Adversarial block (11 pairs).** Negated experience, aspirations
  ("eager to learn"), keyword stuffing, out-of-dictionary skills, C/C++/C#
  and Java/JavaScript near-misses, the go-verb trap, abbreviations
  (ts/k8s/es6), tiering sections, and unscorable JDs. These pin behaviours the
  matcher explicitly claims (they pass because the v2 engine implements
  negation and tiering, not because they are easy).

## What the metrics measure

**Keyword-extraction agreement** between the deterministic extractor and the
author's hand labels on short synthetic texts, plus internal consistency of
the required-coverage score against those same labels. That is all.

They do **not** measure:

- candidate fit, resume quality, or hiring outcomes — a perfect fit_score
  means keyword overlap, nothing more;
- performance on real resumes (PDF-mangled text, multi-column layouts, exotic
  phrasing, skills outside the ~60-entry dictionary);
- semantic understanding — years of experience, proficiency, recency, and
  JD-side negation are all unmodelled (see `docs/matching.md`);
- any LLM provider's suggestion quality (the harness evaluates only the
  deterministic core).

## On the old "1.00 precision / 0.995 F1" claim

Earlier project material quoted 1.00 precision / 0.995 F1 as if it were a
performance result. The recomputed v2 numbers are similar (1.000 / 0.996), and
the same caveat applies even more strongly now that it is written down:
**these figures must not be marketed as general extraction or matching
performance.** They are an internal regression harness score on a small,
synthetic, author-labeled dataset. Precision 1.0 here means "the extractor
never disagreed with its author on texts its author wrote" — an honest
consistency check and a useful regression tripwire, not a benchmark. Any
public claim should say "keyword-coverage demo with a regression-tested
deterministic matcher", not "99.6% accurate resume matching".

## Regression gates

- `backend/tests/test_contract_fixtures.py` — 33 shared contract fixtures
  (also executed by the TypeScript port; parity gate).
- `backend/tests/test_eval_metrics.py` — floors on precision/recall/F1
  (≥ 0.95), fit MAE (≤ 5 pts), band accuracy (≥ 0.9), and dataset size
  (≥ 30 pairs), so silent regressions or a hollowed-out dataset fail CI.
- `python -m app.evaluate` exits non-zero if the behavioural golden set
  regresses.
