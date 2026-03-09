#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIRROR_DIR="$("${ROOT_DIR}/scripts/playwright-linux-mirror.sh")"
METRICS_PATH="${ROOT_DIR}/.tmp/playwright-suite-metrics.json"
CUSTOM_REPORTER="./scripts/playwright-suite-metrics-reporter.cjs"

ARGS=()
REQUESTED_REPORTER=""

while (($#)); do
  case "$1" in
    --reporter)
      shift
      if (($#)); then
        REQUESTED_REPORTER="$1"
      fi
      ;;
    --reporter=*)
      REQUESTED_REPORTER="${1#--reporter=}"
      ;;
    *)
      ARGS+=("$1")
      ;;
  esac
  shift || true
done

if [[ -z "${REQUESTED_REPORTER}" ]]; then
  REQUESTED_REPORTER="list"
fi

cd "${MIRROR_DIR}"
export PW_SUITE_METRICS_PATH="${METRICS_PATH}"
export PW_SUITE_METRICS_ROOT_DIR="${ROOT_DIR}"

set +e
./node_modules/.bin/playwright "${ARGS[@]}" --reporter="${REQUESTED_REPORTER},${CUSTOM_REPORTER}"
STATUS=$?
set -e

node "${ROOT_DIR}/scripts/update-testing-from-playwright-metrics.mjs" "${METRICS_PATH}" || true
exit "${STATUS}"
