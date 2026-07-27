import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeMatch, type MatchResult } from "../lib/matching";

/**
 * Parity regression tests for the v2 matcher contract (ADR 0001), exercising
 * lib/matching `computeMatch` directly in Node — no browser or server needed.
 *
 * Two layers:
 *  1. Shared cross-language fixtures authored by the backend
 *     (backend/tests/fixtures/contract_cases.json) — the hard parity gate with
 *     the Python engine. Skipped with a loud warning while the file does not
 *     exist yet.
 *  2. Inline v2 regression cases pinning the normative behaviours: required-only
 *     fit_score with round-half-to-even, negation filtering, taxonomy splits
 *     (html vs css, numpy vs pandas), insufficient-signal handling and the
 *     suggestion composition rules.
 */

// ---------------------------------------------------------------------------
// Layer 1: shared contract fixtures (canonical parity gate with Python)
// ---------------------------------------------------------------------------

interface ContractCase {
  name: string;
  resume: string;
  jd: string;
  expect: Partial<MatchResult> & { evidence_keys?: string[] };
}

const FIXTURE_PATH = resolve(__dirname, "../../backend/tests/fixtures/contract_cases.json");

test.describe("shared contract fixtures (Python parity gate)", () => {
  if (!existsSync(FIXTURE_PATH)) {
    console.warn(
      `[matching-parity] WARNING: shared fixture file not found at ${FIXTURE_PATH} — ` +
        "the cross-language parity gate did NOT run. It is authored by the backend " +
        "(Agent 4) and must exist before integration is complete."
    );
    test.skip(true, "backend/tests/fixtures/contract_cases.json not present yet");
  }

  const cases: ContractCase[] = existsSync(FIXTURE_PATH)
    ? JSON.parse(readFileSync(FIXTURE_PATH, "utf8"))
    : [];

  for (const c of cases) {
    test(`fixture: ${c.name}`, () => {
      const result = computeMatch(c.resume, c.jd);
      const { evidence_keys, ...exact } = c.expect;
      for (const [key, expected] of Object.entries(exact)) {
        expect(result[key as keyof MatchResult], `field ${key}`).toEqual(expected);
      }
      if (evidence_keys) {
        expect(Object.keys(result.evidence).sort()).toEqual([...evidence_keys].sort());
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 2: inline v2 regression cases
// ---------------------------------------------------------------------------

test.describe("v2 contract: required-only fit_score", () => {
  test("canonical regression: required Python matched, nice-to-haves missing -> 100", () => {
    const r = computeMatch(
      "Python developer.",
      "Required: Python. Nice to have: Kubernetes, Terraform."
    );
    expect(r.schema_version).toBe(2);
    expect(r.status).toBe("ok");
    expect(r.provider).toBe("deterministic");
    expect(r.fit_score).toBe(100);
    expect(r.required_matched).toEqual(["python"]);
    expect(r.required_missing).toEqual([]);
    expect(r.nice_to_have_matched).toEqual([]);
    expect(r.nice_to_have_missing).toEqual(["kubernetes", "terraform"]);
    expect(r.summary).toBe(
      "Strong coverage: the resume covers 1 of 1 required keywords (100%)."
    );
  });

  test("nice-to-have terms never enter the fit_score denominator", () => {
    // 1 of 2 REQUIRED matched -> 50, even though 0 of 2 nice-to-haves matched.
    const r = computeMatch(
      "React apps with Docker.",
      "Requirements: React and TypeScript. Nice to have: Kubernetes, Terraform."
    );
    expect(r.fit_score).toBe(50);
    expect(r.required_matched).toEqual(["react"]);
    expect(r.required_missing).toEqual(["typescript"]);
    expect(r.summary).toBe(
      "Partial coverage: the resume covers 1 of 2 required keywords (50%)."
    );
    expect(r.extra_skills).toContain("docker");
  });

  test("round-half-even parity: 1 of 8 -> 12 (not 13), 5 of 8 -> 62 (not 63)", () => {
    const jd = "We need React, Python, Java, Rust, PHP, Vue, Angular, and Svelte.";
    expect(computeMatch("Experienced React engineer.", jd).fit_score).toBe(12);
    expect(computeMatch("React, Python, Java, Rust and PHP.", jd).fit_score).toBe(62);
  });
});

test.describe("v2 contract: negation filter", () => {
  test("'No Python experience' does not count as python", () => {
    const r = computeMatch(
      "No Python experience. Built and shipped Docker images.",
      "Required: Python and Docker."
    );
    expect(r.required_matched).toEqual(["docker"]);
    expect(r.required_missing).toEqual(["python"]);
    expect(r.fit_score).toBe(50);
    expect(r.evidence).not.toHaveProperty("python");
    expect(r.evidence.docker).toContain("Docker");
  });

  test("aspirational 'eager to learn' segment contributes neither presence nor evidence", () => {
    const r = computeMatch(
      "Eager to learn Kubernetes. Shipped Terraform modules to production.",
      "Requirements: Kubernetes and Terraform."
    );
    expect(r.required_matched).toEqual(["terraform"]);
    expect(r.required_missing).toEqual(["kubernetes"]);
    expect(r.evidence).not.toHaveProperty("kubernetes");
  });

  test("a skill negated in one segment still counts when affirmed in another", () => {
    const r = computeMatch(
      "Not familiar with advanced Rust macros.\nWrote Rust services for 3 years.",
      "Required: Rust."
    );
    expect(r.required_matched).toEqual(["rust"]);
    expect(r.fit_score).toBe(100);
    expect(r.evidence.rust).toBe("Wrote Rust services for 3 years.");
  });
});

test.describe("v2 contract: taxonomy splits", () => {
  test("css experience does not satisfy an html requirement", () => {
    const r = computeMatch("Styled components with CSS and SCSS.", "Required: HTML.");
    expect(r.required_missing).toEqual(["html"]);
    expect(r.fit_score).toBe(0);
    expect(r.extra_skills).toContain("css");
    expect(r.extra_skills).not.toContain("html");
  });

  test("pandas experience does not satisfy a numpy requirement", () => {
    const r = computeMatch("Data analysis with pandas.", "Required: NumPy.");
    expect(r.required_missing).toEqual(["numpy"]);
    expect(r.fit_score).toBe(0);
    expect(r.extra_skills).toContain("pandas");
  });
});

test.describe("v2 contract: insufficient signal", () => {
  test("no recognised JD skills at all", () => {
    const r = computeMatch(
      "Python developer.",
      "We value teamwork, curiosity and clear writing."
    );
    expect(r.status).toBe("insufficient_signal");
    expect(r.fit_score).toBe(0);
    expect(r.suggestions).toEqual([]);
    expect(r.summary).toBe(
      "No recognised skill keywords were found in the job description, so a coverage score was not computed."
    );
    expect(r.summary).not.toContain("Strong coverage");
  });

  test("only nice-to-have JD skills — coverage still reported, no score", () => {
    const r = computeMatch("Kubernetes administrator.", "Nice to have: Kubernetes, Terraform.");
    expect(r.status).toBe("insufficient_signal");
    expect(r.fit_score).toBe(0);
    expect(r.suggestions).toEqual([]);
    expect(r.nice_to_have_matched).toEqual(["kubernetes"]);
    expect(r.nice_to_have_missing).toEqual(["terraform"]);
    expect(r.required_matched).toEqual([]);
    expect(r.summary).toBe(
      "The job description lists only nice-to-have keywords, so a required-coverage score was not computed."
    );
    expect(r.summary).not.toContain("Strong coverage");
  });
});

test.describe("v2 contract: suggestion composition", () => {
  test("caps at 5 with the exact normative templates and order", () => {
    const r = computeMatch(
      "React developer.",
      "Required: Python, Java, Rust, Golang, React. Nice to have: Kubernetes."
    );
    // required_missing sorted: go, java, python, rust -> first 3 templated.
    expect(r.suggestions).toEqual([
      "If you genuinely have go experience, add a concrete example — a project, metric, or responsibility that shows hands-on use.",
      "If you genuinely have java experience, add a concrete example — a project, metric, or responsibility that shows hands-on use.",
      "If you genuinely have python experience, add a concrete example — a project, metric, or responsibility that shows hands-on use.",
      "Optional keywords not found: kubernetes. Only add one if you can support it truthfully.",
      "Lead with your strongest matched skills (react) near the top of the resume so they are seen first.",
    ]);
    expect(r.suggestions.length).toBeLessThanOrEqual(5);
  });

  test("full required coverage swaps missing-skill items for the depth suggestion", () => {
    const r = computeMatch(
      "Python and Docker in production.",
      "Required: Python and Docker. Nice to have: Kubernetes."
    );
    expect(r.suggestions).toEqual([
      "Optional keywords not found: kubernetes. Only add one if you can support it truthfully.",
      "All recognised required keywords are covered — emphasise depth and impact (metrics, scale, ownership) for your matched skills.",
      "Lead with your strongest matched skills (docker, python) near the top of the resume so they are seen first.",
    ]);
  });
});
