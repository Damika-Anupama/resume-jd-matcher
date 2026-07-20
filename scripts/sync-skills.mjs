#!/usr/bin/env node
// Sync the canonical skill dictionary to the frontend.
//
// backend/app/skills.json is the single source of truth for the matcher's skill
// aliases. The frontend TypeScript port imports frontend/lib/skills.json, which
// is generated from the canonical file by this script.
//
//   node scripts/sync-skills.mjs          # regenerate the frontend copy
//   node scripts/sync-skills.mjs --check  # verify it is in sync (CI); exit 1 on drift
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const canonicalPath = join(repoRoot, "backend", "app", "skills.json");
const frontendPath = join(repoRoot, "frontend", "lib", "skills.json");

// Normalize to a stable, deterministic representation so backend and frontend
// copies are byte-identical regardless of incidental whitespace.
const canonical = JSON.parse(readFileSync(canonicalPath, "utf8"));
const rendered = JSON.stringify(canonical, null, 2) + "\n";

const check = process.argv.includes("--check");
let current = null;
try {
  current = readFileSync(frontendPath, "utf8");
} catch {
  current = null;
}

if (check) {
  if (current !== rendered) {
    console.error(
      "[sync-skills] frontend/lib/skills.json is out of sync with backend/app/skills.json.\n" +
        "Run `node scripts/sync-skills.mjs` and commit the result."
    );
    process.exit(1);
  }
  console.log("[sync-skills] frontend skills.json is in sync.");
} else {
  if (current === rendered) {
    console.log("[sync-skills] frontend skills.json already up to date.");
  } else {
    writeFileSync(frontendPath, rendered);
    console.log("[sync-skills] wrote frontend/lib/skills.json.");
  }
}
