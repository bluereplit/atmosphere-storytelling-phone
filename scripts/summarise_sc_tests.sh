#!/usr/bin/env bash
# summarise_sc_tests.sh — parse sclang test_all.scd stdout and write a
# GitHub Actions Job Summary to $GITHUB_STEP_SUMMARY.
#
# Usage:
#   summarise_sc_tests.sh <log_file>
#
# The script exits 0 regardless of test outcome so that the summary step
# never masks the test step's own exit code.

set -euo pipefail

LOG="${1:-}"
if [[ -z "$LOG" || ! -f "$LOG" ]]; then
  echo "Usage: $0 <log_file>" >&2
  exit 1
fi

# Extract the "Passed: N / M" line
SUMMARY_LINE=$(grep -E '^Passed: [0-9]+ / [0-9]+' "$LOG" || true)

if [[ -z "$SUMMARY_LINE" ]]; then
  # sclang crashed before it printed results
  {
    echo "## SuperCollider SynthDef Test Results"
    echo ""
    echo "> **Error:** sclang did not produce a results summary. Check the raw log for details."
  } >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

PASSED=$(echo "$SUMMARY_LINE" | grep -oP '(?<=Passed: )\d+')
TOTAL=$(echo "$SUMMARY_LINE" | grep -oP '(?<= / )\d+')
FAILED=$(( TOTAL - PASSED ))

# Collect failed def names from the "  - defname" lines that follow "Failed (N):"
mapfile -t FAILED_NAMES < <(
  awk '/^Failed \([0-9]+\):/{found=1; next} found && /^  - /{print substr($0,5)}' "$LOG"
)

# Collect per-def results for the detail table
# Lines look like:
#   "  Testing attr_crickets ...  PASS (amp accum: 0.12345)"
#   "  Testing attr_thunder [stochastic] ...  FAIL (amp accum: 0.00000 — below threshold 3e-05)"
declare -a DEF_NAMES=()
declare -a DEF_STATUS=()
declare -a DEF_AMP=()

while IFS= read -r line; do
  if [[ "$line" =~ ^[[:space:]]*Testing[[:space:]]+([^[:space:]]+)([[:space:]]+\[stochastic\])?[[:space:]]+\.\.\.[[:space:]]+(PASS|FAIL) ]]; then
    name="${BASH_REMATCH[1]}"
    stoch="${BASH_REMATCH[2]}"
    status="${BASH_REMATCH[3]}"
    amp=$(echo "$line" | grep -oP 'amp accum: \K[0-9e.+-]+' || echo "?")
    label="$name"
    [[ -n "$stoch" ]] && label="$name *(stochastic)*"
    DEF_NAMES+=("$label")
    if [[ "$status" == "PASS" ]]; then
      DEF_STATUS+=("✅ PASS")
    else
      DEF_STATUS+=("❌ FAIL")
    fi
    DEF_AMP+=("$amp")
  fi
done < "$LOG"

{
  echo "## SuperCollider SynthDef Test Results"
  echo ""
  if [[ "$FAILED" -eq 0 ]]; then
    echo "✅ **All ${TOTAL} SynthDefs passed.**"
  else
    echo "❌ **${PASSED} / ${TOTAL} passed — ${FAILED} failed.**"
    echo ""
    echo "### Failed SynthDefs"
    echo ""
    echo "| SynthDef |"
    echo "|----------|"
    for name in "${FAILED_NAMES[@]}"; do
      echo "| \`$name\` |"
    done
  fi

  if [[ "${#DEF_NAMES[@]}" -gt 0 ]]; then
    echo ""
    echo "<details><summary>Full per-SynthDef results</summary>"
    echo ""
    echo "| SynthDef | Result | Amp accum |"
    echo "|----------|--------|-----------|"
    for i in "${!DEF_NAMES[@]}"; do
      echo "| ${DEF_NAMES[$i]} | ${DEF_STATUS[$i]} | ${DEF_AMP[$i]} |"
    done
    echo ""
    echo "</details>"
  fi
} >> "$GITHUB_STEP_SUMMARY"
