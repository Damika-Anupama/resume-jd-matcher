/**
 * Deterministic resume <-> JD matching engine (TypeScript port).
 *
 * Mirrors backend/app/matching.py so the Vercel deployment is fully
 * self-contained (no Python backend needed live) while staying reproducible.
 * The structured score here is identical in spirit to the backend's.
 */

export const SKILL_ALIASES: Record<string, string[]> = {
  react: ["react", "react.js", "reactjs"],
  "next.js": ["next.js", "nextjs", "next js"],
  typescript: ["typescript", "ts"],
  javascript: ["javascript", "js", "es6"],
  python: ["python"],
  fastapi: ["fastapi"],
  django: ["django"],
  "node.js": ["node.js", "nodejs", "node js", "express"],
  "rest apis": ["rest api", "rest apis", "restful", "rest"],
  postgresql: ["postgresql", "postgres"],
  mysql: ["mysql"],
  mongodb: ["mongodb", "mongo"],
  docker: ["docker", "containerization", "containers"],
  kubernetes: ["kubernetes", "k8s", "eks", "gke"],
  terraform: ["terraform", "iac", "infrastructure as code"],
  aws: ["aws", "amazon web services"],
  gcp: ["gcp", "google cloud"],
  "ci/cd": ["ci/cd", "cicd", "continuous integration", "github actions"],
  prometheus: ["prometheus"],
  grafana: ["grafana"],
  observability: ["observability", "monitoring", "logging", "tracing"],
  kafka: ["kafka", "pub/sub", "event-driven"],
  llm: ["llm", "large language model", "openai", "anthropic", "rag", "gpt"],
  playwright: ["playwright", "e2e testing", "end-to-end tests"],
  testing: ["unit test", "unit tests", "integration test", "integration tests", "pytest", "jest", "testing", "test coverage"],
  graphql: ["graphql"],
  redis: ["redis", "caching"],
  microservices: ["microservices", "distributed systems"],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSkills(text: string): Set<string> {
  const lowered = ` ${text.toLowerCase()} `;
  const found = new Set<string>();
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    for (const alias of aliases) {
      // Token-aware boundary: the leading guard excludes a preceding "." so a
      // short alias ("js"/"ts") does not match a file-extension suffix
      // ("next.js"); the trailing guard allows a following "." so a skill at a
      // sentence end ("...uses Python.") still matches. Mirrors matching.py.
      const pattern = new RegExp(`(?<![a-z0-9.])${escapeRegExp(alias)}(?![a-z0-9])`);
      if (pattern.test(lowered)) {
        found.add(canonical);
        break;
      }
    }
  }
  return found;
}

export interface MatchResult {
  fit_score: number;
  matched_skills: string[];
  missing_skills: string[];
  extra_skills: string[];
  summary: string;
  suggestions: string[];
  provider: string;
}

function mockSuggestions(missing: string[], matched: string[]): string[] {
  const suggestions: string[] = [];
  for (const skill of missing.slice(0, 5)) {
    suggestions.push(
      `Add concrete evidence of ${skill} — a project, metric, or responsibility that demonstrates hands-on use.`
    );
  }
  if (missing.length === 0) {
    suggestions.push(
      "Strong coverage — emphasise depth and impact (metrics, scale, ownership) for the matched skills rather than adding new ones."
    );
  }
  if (matched.length > 0) {
    suggestions.push(
      `Lead with your strongest matched skills (${matched.slice(0, 3).join(", ")}) near the top of the resume so they are seen first.`
    );
  }
  return suggestions;
}

export function computeMatch(resumeText: string, jdText: string): MatchResult {
  const jdSkills = extractSkills(jdText);
  const resumeSkills = extractSkills(resumeText);

  if (jdSkills.size === 0) {
    return {
      fit_score: 0,
      matched_skills: [],
      missing_skills: [],
      extra_skills: [...resumeSkills].sort(),
      summary: "No recognised target skills were found in the job description.",
      suggestions: [],
      provider: "mock",
    };
  }

  const matched = [...jdSkills].filter((s) => resumeSkills.has(s)).sort();
  const missing = [...jdSkills].filter((s) => !resumeSkills.has(s)).sort();
  const extra = [...resumeSkills].filter((s) => !jdSkills.has(s)).sort();
  const fit = Math.round((100 * matched.length) / jdSkills.size);

  const band = fit >= 80 ? "Strong match" : fit >= 50 ? "Partial match" : "Weak match";
  const summary = `${band}: the resume covers ${matched.length} of ${jdSkills.size} required skills (${fit}%).`;

  return {
    fit_score: fit,
    matched_skills: matched,
    missing_skills: missing,
    extra_skills: extra,
    summary,
    suggestions: mockSuggestions(missing, matched),
    provider: "mock",
  };
}
