"""Regression + quantitative-eval tests for the matching core.

These complement test_matching.py (behavioural) and test_api.py (golden set)
by (a) pinning the specific bugs we fixed so they can't silently return, and
(b) asserting the quantitative eval harness stays above honest quality bars.
"""
from app.matching import extract_skills, compute_match
from app.evaluate import evaluate_metrics


# --------------------------------------------------------------------------- #
# Regression guards for fixed bugs
# --------------------------------------------------------------------------- #
def test_js_extension_does_not_yield_phantom_javascript():
    """'.js'/'.ts' file-extension suffixes must NOT match the js/ts aliases.

    Before the boundary fix, 'Next.js' produced a phantom 'javascript' skill
    from the trailing '.js'. This regression test pins that fix.
    """
    skills = extract_skills("I build apps with Next.js and Node.js")
    assert "next.js" in skills
    assert "node.js" in skills
    assert "javascript" not in skills


def test_standalone_js_still_matches_javascript():
    """A real standalone 'js' token must still resolve to javascript."""
    assert "javascript" in extract_skills("Strong with js and css")


def test_skill_at_sentence_end_still_matches():
    """A trailing period (sentence end) must not break extraction."""
    assert "python" in extract_skills("My primary language is Python.")


def test_ci_cd_token_matches():
    assert "ci/cd" in extract_skills("We practise CI/CD with GitHub Actions")


def test_unit_tests_plural_matches_testing():
    assert "testing" in extract_skills("Karma/Jasmine unit tests on every PR")


def test_data_pipelines_plural_matches():
    assert "data engineering" in extract_skills("Owns the data pipelines")


def test_bare_english_words_are_not_phantom_skills():
    """Ambiguous bare aliases were removed to cut false positives.

    'rest' (the English word), 'caching' (only redis-implied), and 'agile' (the
    adjective) must NOT extract phantom skills, while the specific, unambiguous
    aliases for the same canonical skill still do.
    """
    # 'rest' the word must not yield "rest apis"; RESTful/REST API still do.
    assert "rest apis" not in extract_skills("We value rest and work-life balance")
    assert "rest apis" in extract_skills("Designs RESTful services")
    assert "rest apis" in extract_skills("Built REST APIs in FastAPI")

    # 'caching' alone must not yield redis; the word 'redis' still does.
    assert "redis" not in extract_skills("caching fruit for the winter")
    assert "redis" in extract_skills("Redis for hot-path caching")

    # 'agile' the adjective must not yield the skill; scrum/kanban still do.
    assert "agile" not in extract_skills("A small, agile, fast-moving team")
    assert "agile" in extract_skills("Runs Scrum with Kanban boards")


def test_expanded_dictionary_recognises_common_skills():
    text = "Java Spring Boot, Vue.js, Tailwind, Airflow, PyTorch, scikit-learn"
    skills = extract_skills(text)
    assert {"java", "spring", "vue", "tailwind", "airflow", "pytorch",
            "scikit-learn"} <= skills


# --------------------------------------------------------------------------- #
# Quantitative eval harness must hold honest quality bars
# --------------------------------------------------------------------------- #
def test_eval_metrics_extraction_quality():
    m = evaluate_metrics()
    se = m["skill_extraction"]
    # These bars reflect the genuinely-measured current quality; if a future
    # change drops below them, that's a real regression worth surfacing.
    assert se["precision"] >= 0.95, se
    assert se["recall"] >= 0.95, se
    assert se["f1"] >= 0.95, se


def test_eval_metrics_fit_error_is_small():
    m = evaluate_metrics()
    # Mean absolute error in fit-score points vs human reference.
    assert m["fit_score"]["mean_absolute_error"] <= 5.0, m["fit_score"]


def test_eval_metrics_band_accuracy():
    m = evaluate_metrics()
    assert m["band_classification"]["accuracy"] >= 0.9, m["band_classification"]


def test_eval_metrics_dataset_is_nontrivial():
    m = evaluate_metrics()
    # Guard against the "empty template emits green" failure: the dataset must
    # actually contain a meaningful number of labeled pairs.
    assert m["dataset_size"] >= 15
    assert m["skill_extraction"]["true_positives"] >= 100


# --------------------------------------------------------------------------- #
# Score monotonicity sanity: more coverage => not-lower score
# --------------------------------------------------------------------------- #
def test_more_coverage_scores_at_least_as_high():
    jd = "Python, FastAPI, Docker, Kubernetes required."
    low = compute_match("Python only.", jd).fit_score
    high = compute_match("Python, FastAPI, Docker, Kubernetes.", jd).fit_score
    assert high >= low
    assert high == 100
