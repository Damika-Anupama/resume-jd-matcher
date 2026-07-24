"""Run every shared contract fixture through the Python matcher.

``tests/fixtures/contract_cases.json`` is the canonical parity gate from
ADR 0001: the TypeScript port runs the exact same cases and must produce
identical output. If a case fails here, fix the matcher or version the
contract — never the fixture alone.
"""
import json
from pathlib import Path

import pytest

from app.matching import compute_match

_FIXTURES_PATH = Path(__file__).parent / "fixtures" / "contract_cases.json"
CASES = json.loads(_FIXTURES_PATH.read_text(encoding="utf-8"))

_LIST_KEYS = (
    "required_matched",
    "required_missing",
    "nice_to_have_matched",
    "nice_to_have_missing",
)


def test_fixture_file_is_wellformed():
    assert len(CASES) >= 25
    names = [c["name"] for c in CASES]
    assert len(names) == len(set(names)), "fixture names must be unique"
    for case in CASES:
        assert set(case) == {"name", "resume", "jd", "expect"}
        for key in ("status", "fit_score", *_LIST_KEYS):
            assert key in case["expect"], f"{case['name']} missing expect.{key}"


def test_enough_cases_pin_exact_strings():
    exact = [c for c in CASES if "suggestions" in c["expect"] and "summary" in c["expect"]]
    assert len(exact) >= 8


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_contract_case(case):
    result = compute_match(case["resume"], case["jd"]).to_dict()
    expect = case["expect"]

    assert result["schema_version"] == 2
    assert result["status"] == expect["status"]
    assert result["fit_score"] == expect["fit_score"]
    for key in _LIST_KEYS:
        assert result[key] == expect[key], f"{key} mismatch"

    # Legacy unions must stay consistent with the tiered lists.
    assert result["matched_skills"] == sorted(
        set(expect["required_matched"]) | set(expect["nice_to_have_matched"])
    )
    assert result["missing_skills"] == sorted(
        set(expect["required_missing"]) | set(expect["nice_to_have_missing"])
    )

    if "suggestions" in expect:
        assert result["suggestions"] == expect["suggestions"]
    if "summary" in expect:
        assert result["summary"] == expect["summary"]
    if "evidence_keys" in expect:
        assert sorted(result["evidence"]) == expect["evidence_keys"]

    # Invariants that hold for every case regardless of exact expectations:
    assert len(result["suggestions"]) <= 5
    assert all(isinstance(s, str) and s.strip() for s in result["suggestions"])
    if result["status"] == "insufficient_signal":
        assert result["suggestions"] == []
        assert result["fit_score"] == 0
        assert "Strong" not in result["summary"]
