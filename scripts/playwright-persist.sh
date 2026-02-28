#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p .tmp/playwright-profile
export PW_PERSIST_PROFILE=1

exec ./node_modules/.bin/playwright "$@"
