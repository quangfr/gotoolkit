#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_MIRROR_DIR="${HOME}/.cache/gotoolkit-playwright"
MIRROR_DIR="${PW_LINUX_MIRROR_DIR:-${DEFAULT_MIRROR_DIR}}"
MARKER_FILE=".pw-package-lock.sha256"
FULL_SYNC_MARKER=".pw-full-sync-done"
LOCK_FILE=".pw-sync.lock"

should_skip_path() {
  local rel="$1"
  case "$rel" in
    .git|.git/*|node_modules|node_modules/*|test-results|test-results/*|tests/results|tests/results/*|playwright-report|playwright-report/*|.tmp|.tmp/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

copy_path() {
  local rel="$1"
  [[ -n "$rel" ]] || return 0
  should_skip_path "$rel" && return 0

  local src="${ROOT_DIR}/${rel}"
  local dest="${MIRROR_DIR}/${rel}"

  if [[ -d "$src" ]]; then
    mkdir -p "$dest"
    rsync -a "$src"/ "$dest"/
    return 0
  fi

  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dest")"
    cp -f "$src" "$dest"
    return 0
  fi
}

remove_path() {
  local rel="$1"
  [[ -n "$rel" ]] || return 0
  should_skip_path "$rel" && return 0
  rm -rf "${MIRROR_DIR:?}/${rel}"
}

full_sync() {
  rsync -a \
    --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'test-results' \
    --exclude 'tests/results' \
    --exclude '.tmp' \
    --exclude 'playwright-report' \
    "${ROOT_DIR}/" "${MIRROR_DIR}/"
  touch "${MIRROR_DIR}/${FULL_SYNC_MARKER}"
}

incremental_sync() {
  local changed_files deleted_files untracked_files rel

  changed_files="$(git -C "${ROOT_DIR}" diff --name-only --cached; git -C "${ROOT_DIR}" diff --name-only)"
  deleted_files="$(git -C "${ROOT_DIR}" diff --name-only --diff-filter=D --cached; git -C "${ROOT_DIR}" diff --name-only --diff-filter=D)"
  untracked_files="$(git -C "${ROOT_DIR}" ls-files --others --exclude-standard)"

  while IFS= read -r rel; do
    copy_path "$rel"
  done < <(printf '%s\n%s\n' "$changed_files" "$untracked_files" | awk 'NF && !seen[$0]++')

  while IFS= read -r rel; do
    remove_path "$rel"
  done < <(printf '%s\n' "$deleted_files" | awk 'NF && !seen[$0]++')
}

sync_dependencies_if_needed() {
  local source_lock="${ROOT_DIR}/package-lock.json"
  local target_lock="${MIRROR_DIR}/${MARKER_FILE}"
  local source_hash=""
  local target_hash=""

  if [[ -f "${source_lock}" ]]; then
    source_hash="$(sha256sum "${source_lock}" | awk '{print $1}')"
  fi

  if [[ -f "${target_lock}" ]]; then
    target_hash="$(tr -d '[:space:]' < "${target_lock}")"
  fi

  if [[ ! -d "${MIRROR_DIR}/node_modules" || -z "${source_hash}" || "${source_hash}" != "${target_hash}" ]]; then
    (
      cd "${MIRROR_DIR}"
      npm ci >&2
    )
    if [[ -n "${source_hash}" ]]; then
      printf '%s\n' "${source_hash}" > "${target_lock}"
    fi
  fi
}

if [[ "$(uname -s)" != "Linux" ]]; then
  printf '%s\n' "${ROOT_DIR}"
  exit 0
fi

mkdir -p "${MIRROR_DIR}"

exec 9>"${MIRROR_DIR}/${LOCK_FILE}"
flock 9

if [[ ! -f "${MIRROR_DIR}/${FULL_SYNC_MARKER}" || "${PW_LINUX_MIRROR_FULL_SYNC:-0}" == "1" ]]; then
  full_sync
else
  incremental_sync
fi

sync_dependencies_if_needed

printf '%s\n' "${MIRROR_DIR}"
