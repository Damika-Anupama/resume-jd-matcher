"""Evaluation harness for the deterministic matching core.

Recruiters for applied-LLM roles expect evidence of *evaluation*, not just a
model call. This harness has two layers, both running with no API key because
they evaluate the reproducible deterministic core:

1. ``evaluate()`` — a behavioural golden set (assertion-style cases): each case
   pins a fit range and required matched/missing skills. Pass/fail per case.

2. ``evaluate_metrics()`` — a *quantitative* harness over a hand-labeled dataset
   (``app.eval_dataset``). It measures the extractor against human gold labels
   and reports concrete numbers:
     - skill-extraction **precision / recall / F1** (micro-averaged over all
       resume+JD sides), so a phantom skill (false positive) or a missed skill
       (false negative) is actually counted, not hidden;
     - fit-score **mean absolute error** vs a human reference fit; and
     - fit-**band classification accuracy** (strong / partial / weak).

Run directly:  ``python -m app.evaluate``       (golden set + metrics)
               ``python -m app.evaluate --json`` (machine-readable report)
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass

from app.matching import compute_match, extract_resume_skills, extract_skills
from app.eval_dataset import DATASET, LabeledPair


# --------------------------------------------------------------------------- #
# Layer 1: behavioural golden set (backward compatible)
# --------------------------------------------------------------------------- #
@dataclass
class Case:
    name: str
    resume: str
    jd: str
    expect_min_fit: int
    expect_max_fit: int
    must_match: list[str]
    must_miss: list[str]


GOLDEN_SET: list[Case] = [
    Case(
        name="strong_frontend",
        resume="Built React and Next.js apps in TypeScript with REST APIs and Jest testing.",
        jd="We need React, Next.js, TypeScript and REST API experience.",
        expect_min_fit=90,
        expect_max_fit=100,
        must_match=["react", "next.js", "typescript", "rest apis"],
        must_miss=[],
    ),
    Case(
        name="partial_backend",
        resume="Python and FastAPI services with PostgreSQL. Some Docker.",
        jd="Python, FastAPI, Kubernetes, Terraform and observability required.",
        expect_min_fit=30,
        expect_max_fit=60,
        must_match=["python", "fastapi"],
        must_miss=["kubernetes", "terraform", "observability"],
    ),
    Case(
        name="weak_devops",
        resume="Frontend developer focused on React and CSS.",
        jd="AWS, Kubernetes, Terraform, CI/CD and Prometheus needed.",
        expect_min_fit=0,
        expect_max_fit=20,
        must_match=[],
        must_miss=["aws", "kubernetes", "terraform", "ci/cd", "prometheus"],
    ),
    Case(
        name="llm_role",
        resume="Built RAG pipelines with OpenAI and FastAPI, plus Playwright e2e tests.",
        jd="LLM integration, FastAPI backend and end-to-end tests expected.",
        expect_min_fit=90,
        expect_max_fit=100,
        must_match=["llm", "fastapi", "playwright"],
        must_miss=[],
    ),
    # --- added boundary/regression cases ---
    Case(
        name="js_extension_not_javascript",
        # Regression guard: "Next.js"/"Node.js" must NOT yield a phantom
        # "javascript" skill from the ".js" file-extension suffix.
        resume="Engineer using Next.js and Node.js every day.",
        jd="We need Next.js and Node.js experience.",
        expect_min_fit=100,
        expect_max_fit=100,
        must_match=["next.js", "node.js"],
        must_miss=[],
    ),
    Case(
        name="data_engineer_strong",
        resume="ETL pipelines with Airflow and Spark. Python, SQL, PostgreSQL.",
        jd="Data engineer: Python, SQL, Airflow, Spark, PostgreSQL.",
        expect_min_fit=90,
        expect_max_fit=100,
        must_match=["python", "sql", "airflow", "spark", "postgresql"],
        must_miss=[],
    ),
    Case(
        name="negated_experience_not_matched",
        resume="Strong Python. No Kubernetes experience.",
        jd="Python and Kubernetes required.",
        expect_min_fit=50,
        expect_max_fit=50,
        must_match=["python"],
        must_miss=["kubernetes"],
    ),
    Case(
        name="go_verb_guard",
        resume="Led our go to market strategy.",
        jd="Golang required.",
        expect_min_fit=0,
        expect_max_fit=0,
        must_match=[],
        must_miss=["go"],
    ),
]


def evaluate() -> dict:
    """Behavioural golden-set evaluation (per-case pass/fail)."""
    passed = 0
    failures: list[str] = []
    for case in GOLDEN_SET:
        result = compute_match(case.resume, case.jd)
        ok = True
        reasons = []
        if not (case.expect_min_fit <= result.fit_score <= case.expect_max_fit):
            ok = False
            reasons.append(
                f"fit {result.fit_score} not in "
                f"[{case.expect_min_fit},{case.expect_max_fit}]"
            )
        for skill in case.must_match:
            if skill not in result.matched_skills:
                ok = False
                reasons.append(f"expected matched skill missing: {skill}")
        for skill in case.must_miss:
            if skill not in result.missing_skills:
                ok = False
                reasons.append(f"expected missing skill not flagged: {skill}")
        if ok:
            passed += 1
        else:
            failures.append(f"{case.name}: {'; '.join(reasons)}")

    total = len(GOLDEN_SET)
    return {
        "total": total,
        "passed": passed,
        "accuracy": round(passed / total, 3) if total else 0.0,
        "failures": failures,
    }


# --------------------------------------------------------------------------- #
# Layer 2: quantitative metrics over the hand-labeled dataset
# --------------------------------------------------------------------------- #
def _band(fit: int) -> str:
    if fit >= 80:
        return "strong"
    if fit >= 50:
        return "partial"
    return "weak"


def _reference_fit(pair: LabeledPair) -> float | None:
    """Human-reference fit % under the v2 (required-coverage) contract.

    Coverage of the gold *required* JD skills (gold JD minus human-labeled
    nice-to-haves) by the gold resume skills. Returns None when the JD has no
    gold required skills (undefined denominator / insufficient signal).
    """
    gold_required = pair.gold_jd_skills - pair.gold_nice_jd_skills
    if not gold_required:
        return None
    covered = gold_required & pair.gold_resume_skills
    return 100.0 * len(covered) / len(gold_required)


def evaluate_metrics() -> dict:
    """Quantitative extraction + scoring metrics vs human gold labels."""
    tp = fp = fn = 0  # micro-averaged skill-extraction confusion counts
    abs_errors: list[float] = []
    band_correct = 0
    band_total = 0
    per_case: list[dict] = []

    for pair in DATASET:
        # --- skill extraction P/R/F1 (both resume and JD sides) ---
        # The resume side uses the negation-aware extractor (what the matcher
        # actually consumes); the JD side uses the raw extractor.
        for predicted, gold in (
            (extract_resume_skills(pair.resume), pair.gold_resume_skills),
            (extract_skills(pair.jd), pair.gold_jd_skills),
        ):
            tp += len(predicted & gold)
            fp += len(predicted - gold)
            fn += len(gold - predicted)

        # --- fit-score error vs human reference ---
        result = compute_match(pair.resume, pair.jd)
        ref = _reference_fit(pair)
        case_err = None
        if ref is not None:
            case_err = abs(result.fit_score - ref)
            abs_errors.append(case_err)

        # --- band classification accuracy ---
        predicted_band = (
            "unscorable"
            if result.status == "insufficient_signal"
            else _band(result.fit_score)
        )
        band_total += 1
        band_ok = predicted_band == pair.expect_band
        if band_ok:
            band_correct += 1

        per_case.append({
            "name": pair.name,
            "fit": result.fit_score,
            "reference_fit": round(ref, 1) if ref is not None else None,
            "abs_error": round(case_err, 1) if case_err is not None else None,
            "predicted_band": predicted_band,
            "expected_band": pair.expect_band,
            "band_ok": band_ok,
        })

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    mae = sum(abs_errors) / len(abs_errors) if abs_errors else 0.0
    band_acc = band_correct / band_total if band_total else 0.0

    return {
        "dataset_size": len(DATASET),
        "skill_extraction": {
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1": round(f1, 3),
        },
        "fit_score": {
            "mean_absolute_error": round(mae, 2),
            "scored_pairs": len(abs_errors),
        },
        "band_classification": {
            "accuracy": round(band_acc, 3),
            "correct": band_correct,
            "total": band_total,
        },
        "per_case": per_case,
    }


def _print_human(golden: dict, metrics: dict) -> None:
    print("=" * 62)
    print("RESUME ↔ JD MATCHER — EVALUATION REPORT")
    print("=" * 62)
    print()
    print("[1] Behavioural golden set")
    print(f"    accuracy: {golden['accuracy']} ({golden['passed']}/{golden['total']})")
    for failure in golden["failures"]:
        print("    FAIL:", failure)
    print()

    se = metrics["skill_extraction"]
    fs = metrics["fit_score"]
    bc = metrics["band_classification"]
    print(f"[2] Quantitative metrics  (n={metrics['dataset_size']} labeled pairs)")
    print("    Skill extraction vs human gold labels:")
    print(f"      precision : {se['precision']}  (tp={se['true_positives']}, fp={se['false_positives']})")
    print(f"      recall    : {se['recall']}  (fn={se['false_negatives']})")
    print(f"      F1        : {se['f1']}")
    print(f"    Fit-score mean absolute error : {fs['mean_absolute_error']} pts "
          f"(over {fs['scored_pairs']} pairs)")
    print(f"    Fit-band classification acc   : {bc['accuracy']} "
          f"({bc['correct']}/{bc['total']})")
    print()
    # Surface any band misclassifications honestly.
    misses = [c for c in metrics["per_case"] if not c["band_ok"]]
    if misses:
        print("    Band misclassifications:")
        for c in misses:
            print(f"      {c['name']}: predicted {c['predicted_band']} "
                  f"(fit {c['fit']}) vs expected {c['expected_band']}")
    else:
        print("    Band misclassifications: none")
    print("=" * 62)


def main() -> int:
    # Windows consoles default to cp1252, which can't encode the "↔" in the
    # report header (raises UnicodeEncodeError). Force UTF-8 so the human report
    # prints everywhere; on POSIX/CI this is already the default.
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    golden = evaluate()
    metrics = evaluate_metrics()
    if "--json" in sys.argv:
        print(json.dumps({"golden_set": golden, "metrics": metrics}, indent=2))
    else:
        _print_human(golden, metrics)
    # Non-zero exit if the behavioural golden set regresses (CI-friendly).
    return 0 if golden["accuracy"] == 1.0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
