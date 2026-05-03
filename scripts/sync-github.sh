#!/usr/bin/env bash
# =============================================================================
#  sync-github.sh
#
#  Pushes the current branch to the "github" remote after each Replit task merge.
#  Called automatically by scripts/post-merge.sh — do not run by hand.
#
#  A dedicated remote named "github" is used rather than "origin" to avoid
#  conflicting with whatever origin is configured in the Replit workspace.
#
#  Authentication is handled by the replit-git-askpass credential helper, which
#  injects the OAuth token from the connected GitHub integration.
#
#  The script is intentionally non-fatal: if the push fails it prints a prominent
#  warning but exits 0 so the broader post-merge flow is never blocked.
#  Check the post-merge log output if GitHub appears to be behind.
# =============================================================================

set -euo pipefail

GITHUB_REMOTE="github"
GITHUB_URL="https://github.com/bluereplit/atmosphere-storytelling-system.git"

log()  { echo "[sync-github] $*"; }
warn() { echo "[sync-github] WARNING: $*" >&2; }

# ── Ensure dedicated "github" remote is configured ───────────────────────────
if git remote get-url "$GITHUB_REMOTE" &>/dev/null; then
    CURRENT_URL="$(git remote get-url "$GITHUB_REMOTE")"
    if [[ "$CURRENT_URL" != "$GITHUB_URL" ]]; then
        log "Updating '$GITHUB_REMOTE' remote: $CURRENT_URL → $GITHUB_URL"
        git remote set-url "$GITHUB_REMOTE" "$GITHUB_URL"
    fi
else
    log "Adding '$GITHUB_REMOTE' remote → $GITHUB_URL"
    git remote add "$GITHUB_REMOTE" "$GITHUB_URL"
fi

# ── Push ──────────────────────────────────────────────────────────────────────
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"
log "Pushing $BRANCH ($SHORT_SHA) to $GITHUB_REMOTE …"

if git push "$GITHUB_REMOTE" "$BRANCH" 2>&1; then
    log "GitHub is up to date ($SHORT_SHA)."
else
    warn "=========================================================="
    warn "  git push to GitHub FAILED — GitHub may be behind Replit."
    warn "  Run manually to retry:"
    warn "    git push $GITHUB_REMOTE $BRANCH"
    warn "  Or check that the GitHub integration is still connected."
    warn "=========================================================="
    # Exit 0 — don't block the post-merge pipeline.
    exit 0
fi
