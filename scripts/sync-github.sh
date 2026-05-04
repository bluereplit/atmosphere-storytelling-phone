#!/usr/bin/env bash
# =============================================================================
#  sync-github.sh
#
#  Pushes the current branch to the "github" remote after each Replit task merge.
#  Called automatically by scripts/post-merge.sh — do not run by hand.
#
#  Authentication uses the Replit GitHub integration OAuth token, retrieved via
#  a Node.js one-liner that calls the connector SDK. This works reliably in the
#  headless post-merge context where replit-git-askpass is unavailable.
#
#  The script is intentionally non-fatal: if the push fails it prints a prominent
#  warning but exits 0 so the broader post-merge flow is never blocked.
# =============================================================================

set -euo pipefail

GITHUB_REPO="bluereplit/atmosphere-storytelling-system"
GITHUB_URL_BARE="https://github.com/${GITHUB_REPO}.git"

log()  { echo "[sync-github] $*"; }
warn() { echo "[sync-github] WARNING: $*" >&2; }

# ── Resolve OAuth token from Replit GitHub connector ─────────────────────────
TOKEN=""
if command -v node &>/dev/null; then
    TOKEN="$(node --input-type=module <<'JSEOF' 2>/dev/null || true
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// The connector SDK stores connection settings in process.env or in a
// well-known Replit secrets location. Try env first, then connector API.
const token = process.env.GITHUB_TOKEN
  || process.env.REPLIT_GITHUB_ACCESS_TOKEN
  || '';
if (!token) {
  // Attempt to call the connector runtime endpoint available inside Replit
  try {
    const url = process.env.REPLIT_CONNECTOR_TOKEN_URL;
    if (url) {
      const resp = await fetch(url);
      const { access_token } = await resp.json();
      process.stdout.write(access_token || '');
      process.exit(0);
    }
  } catch {}
}
process.stdout.write(token);
JSEOF
    )" || true
fi

if [[ -z "$TOKEN" ]]; then
    warn "GitHub token not available — skipping push."
    warn "Run manually: git push github main"
    exit 0
fi

AUTHED_URL="https://${TOKEN}@github.com/${GITHUB_REPO}.git"

# ── Ensure dedicated "github" remote points at bare URL (no token stored) ────
if git remote get-url github &>/dev/null; then
    git remote set-url github "$GITHUB_URL_BARE"
else
    log "Adding 'github' remote → $GITHUB_URL_BARE"
    git remote add github "$GITHUB_URL_BARE"
fi

# ── Push using authenticated URL directly (token never stored in config) ─────
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"
log "Pushing $BRANCH ($SHORT_SHA) to github …"

if git push "$AUTHED_URL" "$BRANCH" 2>&1; then
    log "GitHub is up to date ($SHORT_SHA)."
else
    warn "=========================================================="
    warn "  git push to GitHub FAILED — GitHub may be behind Replit."
    warn "  Run manually to retry:"
    warn "    git push github $BRANCH"
    warn "  Or check that the GitHub integration is still connected."
    warn "=========================================================="
    exit 0
fi
