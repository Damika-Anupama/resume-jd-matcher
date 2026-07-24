#!/usr/bin/env node
// Sync the canonical matcher inputs to the frontend.
//
// Two canonical files live in the backend and are mirrored (never hand-edited)
// on the frontend, so the Python matcher and its TypeScript port can never
// disagree on which skills exist or what the contract fixtures expect:
//
//   backend/app/skills.json                  -> frontend/lib/skills.json
//   backend/tests/fixtures/contract_cases.json -> frontend/lib/contract-cases.json
//
//   node scripts/sync-skills.mjs          # regenerate the frontend copies
//   node scripts/sync-skills.mjs --check  # verify sync (CI); exit 1 on drift
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const SYNC_PAIRS = [
  {
    label: "skills",
    canonical: join(repoRoot, "backend", "app", "skills.json"),
    generated: join(repoRoot, "frontend", "lib", "skills.json"),
    generatedRel: "frontend/lib/skills.json",
    canonicalRel: "backend/app/skills.json",
  },
  {
    label: "contract-cases",
    canonical: join(repoRoot, "backend", "tests", "fixtures", "contract_cases.json"),
    generated: join(repoRoot, "frontend", "lib", "contract-cases.json"),
    generatedRel: "frontend/lib/contract-cases.json",
    canonicalRel: "backend/tests/fixtures/contract_cases.json",
  },
];

const check = process.argv.includes("--check");
let drifted = false;

for (const pair of SYNC_PAIRS) {
  // Normalize to a stable, deterministic representation so backend and
  // frontend copies are byte-identical regardless of incidental whitespace.
  const canonical = JSON.parse(readFileSync(pair.canonical, "utf8"));
  const rendered = JSON.stringify(canonical, null, 2) + "\n";

  let current = null;
  try {
    current = readFileSync(pair.generated, "utf8");
  } catch {
    current = null;
  }

  if (check) {
    if (current !== rendered) {
      console.error(
        `[sync-skills] ${pair.generatedRel} is out of sync with ${pair.canonicalRel}.\n` +
          "Run `node scripts/sync-skills.mjs` and commit the result."
      );
      drifted = true;
    } else {
      console.log(`[sync-skills] ${pair.generatedRel} is in sync.`);
    }
  } else {
    if (current === rendered) {
      console.log(`[sync-skills] ${pair.generatedRel} already up to date.`);
    } else {
      writeFileSync(pair.generated, rendered);
      console.log(`[sync-skills] wrote ${pair.generatedRel}.`);
    }
  }
}

if (check && drifted) {
  process.exit(1);
}
