#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Push the latest commit to GitHub so the Pi can pull it with update.sh
bash "$(dirname "$0")/sync-github.sh" || true
