#!/usr/bin/env bash
# Publish the sanitized, client-only demo to the fresh public repository.
#
# Builds a flattened artifact from frontend/ using a strict ALLOWLIST, runs a
# fail-closed leak gate, then pushes the artifact as a single snapshot commit
# (orphan history) to the public mirror. The full-source repository stays
# private; nothing outside the allowlist can ever reach the mirror.
#
# Usage:
#   scripts/publish-demo.sh <artifact-dir>                 # build + gate only
#   PUBLIC_REPO_SSH=git@github.com:OWNER/REPO.git \
#   scripts/publish-demo.sh <artifact-dir> --push          # build + gate + push
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT="${1:?usage: publish-demo.sh <artifact-dir> [--push]}"
PUSH="${2:-}"

rm -rf "$ARTIFACT"
mkdir -p "$ARTIFACT"

# ---------------------------------------------------------------------------
# 1. ALLOWLIST — the ONLY paths that may appear in the public mirror.
#    The demo is client-only: app/api (backend proxies) is deliberately absent.
# ---------------------------------------------------------------------------
FRONTEND_ALLOW=(
  "app"
  "components"
  "lib"
  "workers"
  "public"
  "e2e"
  "scripts"
  "package.json"
  "package-lock.json"
  "next.config.ts"
  "tsconfig.json"
  "postcss.config.mjs"
  "eslint.config.mjs"
  "playwright.config.ts"
  ".gitignore"
)

for entry in "${FRONTEND_ALLOW[@]}"; do
  src="$REPO_ROOT/frontend/$entry"
  [ -e "$src" ] && cp -R "$src" "$ARTIFACT/$entry"
done

# Root-level extras.
cp "$REPO_ROOT/LICENSE" "$ARTIFACT/LICENSE" 2>/dev/null || true
# The public README is the demo-specific one, not the full-product README.
if [ -f "$REPO_ROOT/docs/public-demo-README.md" ]; then
  cp "$REPO_ROOT/docs/public-demo-README.md" "$ARTIFACT/README.md"
else
  cp "$REPO_ROOT/frontend/README.md" "$ARTIFACT/README.md"
fi

# Strip server-only API routes and agent/internal instruction files.
rm -rf "$ARTIFACT/app/api"
find "$ARTIFACT" \( -name "AGENTS.md" -o -name "CLAUDE.md" \) -delete

# ---------------------------------------------------------------------------
# 2. LEAK GATE — fail closed.
# ---------------------------------------------------------------------------
fail() { echo "LEAK GATE FAILED: $1" >&2; exit 1; }

# 2a. Forbidden paths anywhere in the artifact.
FORBIDDEN_NAMES=(backend deploy product journals AGENTS.md CLAUDE.md .env .env.local .env.production terraform k8s)
for name in "${FORBIDDEN_NAMES[@]}"; do
  if find "$ARTIFACT" -name "$name" | grep -q .; then
    fail "forbidden path '$name' present"
  fi
done
# .env files other than safe examples.
if find "$ARTIFACT" -name ".env*" ! -name ".env.example" | grep -q .; then
  fail ".env file present"
fi

# 2b. Unexpected top-level entries (strict allowlist).
TOP_ALLOW=(app components lib workers public e2e scripts package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs playwright.config.ts .gitignore LICENSE README.md)
while IFS= read -r entry; do
  base="$(basename "$entry")"
  ok=false
  for allow in "${TOP_ALLOW[@]}"; do
    [ "$base" = "$allow" ] && ok=true && break
  done
  $ok || fail "unexpected top-level entry '$base'"
done < <(find "$ARTIFACT" -mindepth 1 -maxdepth 1)

# 2c. Secret / credential patterns (fail closed on any hit).
PATTERNS=(
  '-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----'
  'sk-or-[A-Za-z0-9-]{10,}'          # OpenRouter
  'sk-[A-Za-z0-9]{20,}'              # OpenAI-style
  'sk-ant-[A-Za-z0-9-]{10,}'         # Anthropic
  'gh[pousr]_[A-Za-z0-9]{20,}'       # GitHub tokens
  'AKIA[0-9A-Z]{16}'                 # AWS access key
  'AIza[0-9A-Za-z_-]{30,}'           # Google API key
  '(postgres|postgresql|mysql|mongodb(\+srv)?|redis)://[^/\s:]+:[^@\s]+@'  # credentialed DB URLs
  'OPENROUTER_API_KEY[[:space:]]*[:=][[:space:]]*[A-Za-z0-9]'
  'BACKEND_API_KEY[[:space:]]*[:=][[:space:]]*[A-Za-z0-9]'
)
for pat in "${PATTERNS[@]}"; do
  if grep -RInE --binary-files=without-match "$pat" "$ARTIFACT" >/dev/null 2>&1; then
    grep -RInE --binary-files=without-match "$pat" "$ARTIFACT" | head -5 >&2
    fail "secret-like pattern matched: $pat"
  fi
done

# 2d. Full-source backend references that would only exist on a bad copy.
if grep -RIl --binary-files=without-match "app/matching.py\|fastapi\|uvicorn" "$ARTIFACT" --include='*.ts' --include='*.tsx' --include='*.json' >/dev/null 2>&1; then
  echo "note: textual backend references found (informational):" >&2
  grep -RIl --binary-files=without-match "fastapi\|uvicorn" "$ARTIFACT" --include='*.ts' --include='*.tsx' | head -5 >&2 || true
fi

echo "Leak gate passed. Artifact ready at: $ARTIFACT"

# ---------------------------------------------------------------------------
# 3. PUSH — single snapshot commit, orphan history, to the public mirror.
# ---------------------------------------------------------------------------
if [ "$PUSH" = "--push" ]; then
  : "${PUBLIC_REPO_SSH:?PUBLIC_REPO_SSH must be set for --push}"
  cd "$ARTIFACT"
  git init -q -b main
  git add -A
  git -c user.name="demo-publisher" -c user.email="publisher@users.noreply.github.com" \
    commit -q -m "Publish demo snapshot from private source ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  git push --force "$PUBLIC_REPO_SSH" main
  echo "Pushed demo snapshot to $PUBLIC_REPO_SSH"
fi
