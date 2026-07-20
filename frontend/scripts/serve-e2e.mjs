// Serve the production build for Playwright e2e.
//
// next.config.ts uses `output: "standalone"`, which is incompatible with
// `next start`. The standalone server (.next/standalone/server.js) needs the
// static assets and public/ colocated next to it, which `next build` does not
// do automatically. This script performs that copy, then boots the server in
// this process so Playwright's webServer can manage its lifecycle.
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = dirname(scriptsDir);
const standaloneDir = join(frontendDir, ".next", "standalone");
const serverEntry = join(standaloneDir, "server.js");

if (!existsSync(serverEntry)) {
  console.error(
    "[serve-e2e] Standalone build missing at .next/standalone/server.js — run `next build` first."
  );
  process.exit(1);
}

cpSync(join(frontendDir, ".next", "static"), join(standaloneDir, ".next", "static"), {
  recursive: true,
});
const publicDir = join(frontendDir, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, join(standaloneDir, "public"), { recursive: true });
}

process.env.PORT = process.env.PORT || "3000";
process.env.HOSTNAME = process.env.HOSTNAME || "127.0.0.1";
await import(pathToFileURL(serverEntry).href);
