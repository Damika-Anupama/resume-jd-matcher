import { test, expect } from "@playwright/test";

/**
 * Parity regression tests for the matcher, exercised through the real
 * /api/analyze route (which calls lib/matching `computeMatch`).
 *
 * fit_score MUST equal the canonical Python reference
 * (backend/app/matching.py `compute_match`), which uses Python's
 * round-half-to-even. JS `Math.round()` rounds halves UP, so on exact .5
 * percentages the two used to diverge (1 of 8 skills -> 12.5 gave 13 in JS vs
 * 12 in Python). These inputs pin the tie cases so a regression fails CI.
 */

const JD_8_SKILLS =
  "We need React, Python, Java, Rust, PHP, Vue, Angular, and Svelte.";

async function fitScore(
  request: import("@playwright/test").APIRequestContext,
  resume: string,
  jobDescription: string
): Promise<number> {
  const res = await request.post("/api/analyze", {
    data: { resume, job_description: jobDescription },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).fit_score as number;
}

test.describe("matcher parity with Python reference (round-half-to-even)", () => {
  test("1 of 8 skills -> 12.5 rounds to 12, not 13", async ({ request }) => {
    expect(await fitScore(request, "Experienced React engineer.", JD_8_SKILLS)).toBe(12);
  });

  test("5 of 8 skills -> 62.5 rounds to 62, not 63", async ({ request }) => {
    expect(
      await fitScore(request, "React, Python, Java, Rust and PHP.", JD_8_SKILLS)
    ).toBe(62);
  });

  test("2 of 4 skills -> 50 (non-tie) is unaffected", async ({ request }) => {
    expect(
      await fitScore(
        request,
        "Built React and TypeScript apps.",
        "Need React, TypeScript, Kubernetes and Terraform."
      )
    ).toBe(50);
  });
});

/**
 * Parity for the explainability fields (tiering + evidence) against the same
 * reference values pinned in backend/tests/test_matching.py, so the TS port in
 * lib/matching.ts can never silently drift from the Python engine.
 */
test.describe("explainability parity (tiering + evidence)", () => {
  test("inline 'is a plus' clause is sentence-scoped", async ({ request }) => {
    const res = await request.post("/api/analyze", {
      data: {
        resume: "React developer.",
        job_description:
          "Required: React, TypeScript and Docker. Experience with Kubernetes is a plus.",
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(new Set(body.required_skills)).toEqual(
      new Set(["react", "typescript", "docker"])
    );
    expect(body.nice_to_have_skills).toEqual(["kubernetes"]);
  });

  test("evidence points to the matching resume line", async ({ request }) => {
    const res = await request.post("/api/analyze", {
      data: {
        resume: "Summary\nBuilt data pipelines in Python at scale.\nAlso used Docker.",
        job_description: "Need Python and Docker.",
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.evidence.python).toContain("Python");
    expect(body.evidence.docker).toContain("Docker");
    expect(Object.keys(body.evidence).sort()).toEqual(body.matched_skills.sort());
  });
});
