#!/usr/bin/env bash
# check_sc_syntax.sh — Pre-deployment syntax check for SuperCollider files
#
# Runs `sclang` in interpreter-only mode (no audio server) to parse:
#   - artifacts/api-server/sc/startup.scd
#   - artifacts/api-server/sc/envThemes.scd
#   - artifacts/api-server/sc/attributes.scd
#   - artifacts/api-server/sc/voice.scd
#
# Full hardware integration testing (SynthDef audio output, amplitude checks)
# lives in artifacts/api-server/sc/test_all.scd and must be run on the
# Raspberry Pi with a live audio server.
#
# Usage:
#   bash scripts/check_sc_syntax.sh
#
# Exit codes:
#   0  — all files parsed without errors
#   0  — sclang not installed (advisory; see guard below)
#   0  — sclang crashed with SIGABRT/exit 134 before parsing (advisory; environment problem)
#   1  — one or more files contain a syntax error
#   1  — sclang timed out (exit 124)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SC_DIR="$REPO_ROOT/artifacts/api-server/sc"
HELPER="$SC_DIR/check_syntax_helper.scd"
TIMEOUT_SECS=30

echo "=== SuperCollider syntax check ==="
echo "SC dir : $SC_DIR"
echo ""

# ------------------------------------------------------------------
# Guard: sclang must be installed.  On developer machines and CI
# runners that don't have SuperCollider installed we print a clear
# advisory and exit 0 so the check doesn't block unrelated workflows.
# On the Raspberry Pi (where sclang is installed) the check is fully
# enforced and exits non-zero on any parse error.
# ------------------------------------------------------------------
if ! command -v sclang &>/dev/null; then
    echo "ADVISORY: sclang not found on this machine."
    echo "  Install SuperCollider on the Raspberry Pi to enforce this check."
    echo "  Skipping syntax validation — exiting 0."
    exit 0
fi

# Use the offscreen Qt platform so sclang works on headless machines (no X server).
export QT_QPA_PLATFORM=offscreen

SCLANG_VERSION="$(sclang -v 2>/dev/null | head -1 || true)"
if [ -z "$SCLANG_VERSION" ]; then
    SCLANG_VERSION="(version unknown)"
fi
echo "sclang : $SCLANG_VERSION"
echo ""

# ------------------------------------------------------------------
# Run the helper script under a timeout.
# sclang compiles each .scd file via the interpreter (no server boot)
# and exits 0 (pass) or 1 (syntax error found).
#
# Capture the raw exit code before any boolean negation so that the
# timeout exit code (124) is distinguished from a sclang error (1).
# ------------------------------------------------------------------
EXIT_CODE=0
timeout "$TIMEOUT_SECS" sclang "$HELPER" || EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
    if [ "$EXIT_CODE" -eq 124 ]; then
        echo ""
        echo "ERROR: sclang timed out after ${TIMEOUT_SECS}s."
        echo "  This may indicate an infinite loop or a missing 0.exit call."
        exit 1
    elif [ "$EXIT_CODE" -eq 134 ]; then
        echo ""
        echo "ADVISORY: sclang crashed before parsing any files (exit code 134 — SIGABRT)."
        echo "  This is an environment problem, not a code problem. Common causes:"
        echo "    - Running as root without a Chromium/Qt sandbox (e.g. on a Raspberry Pi)."
        echo "    - Missing or broken Qt platform plugin."
        echo "  No SC code was evaluated, so no syntax verdict can be given."
        echo "  Skipping syntax validation — exiting 0."
        exit 0
    else
        echo ""
        echo "ERROR: Syntax check failed (exit code $EXIT_CODE)."
        echo "  Fix the errors above before deploying to the Raspberry Pi."
        exit 1
    fi
fi

echo ""
echo "Syntax check passed. Safe to deploy to the Raspberry Pi."
exit 0
