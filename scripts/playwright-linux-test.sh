#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIRROR_DIR="$("${ROOT_DIR}/scripts/playwright-linux-mirror.sh")"

cd "${MIRROR_DIR}"
exec ./node_modules/.bin/playwright "$@"
