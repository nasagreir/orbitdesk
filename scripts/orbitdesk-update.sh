#!/usr/bin/env bash
# =============================================================================
# OrbitDesk updater — backup first, deploy, health-check, auto-rollback on fail
# =============================================================================
# Usage (inside the LXC as root):
#   orbitdesk-update
#   orbitdesk-update --branch main
#   ORBITDESK_REPO=https://github.com/nasagreir/orbitdesk.git orbitdesk-update
# =============================================================================
set -euo pipefail

APP_DIR="${ORBITDESK_APP_DIR:-/opt/orbitdesk}"
APP_USER="${ORBITDESK_APP_USER:-orbitdesk}"
APP_PORT="${ORBITDESK_PORT:-3456}"
BACKUP_ROOT="${ORBITDESK_BACKUP_ROOT:-/var/backups/orbitdesk}"
KEEP_BACKUPS="${ORBITDESK_KEEP_BACKUPS:-5}"
REPO_URL="${ORBITDESK_REPO:-}"
REPO_BRANCH="${ORBITDESK_BRANCH:-main}"
HEALTH_URL="${ORBITDESK_HEALTH_URL:-http://127.0.0.1:${APP_PORT}/api/auth/me}"
HEALTH_RETRIES="${ORBITDESK_HEALTH_RETRIES:-20}"
HEALTH_SLEEP="${ORBITDESK_HEALTH_SLEEP:-3}"

BL=$'\033[36m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; YW=$'\033[33m'; CL=$'\033[m'
msg(){ echo -e "${BL}[orbitdesk-update]${CL} $*"; }
ok(){ echo -e "${GN}[orbitdesk-update]${CL} $*"; }
warn(){ echo -e "${YW}[orbitdesk-update]${CL} $*"; }
err(){ echo -e "${RD}[orbitdesk-update]${CL} $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) REPO_BRANCH="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --port) APP_PORT="$2"; HEALTH_URL="http://127.0.0.1:${APP_PORT}/api/auth/me"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) err "Unknown argument: $1" ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || err "Run as root inside the OrbitDesk LXC."
[[ -d "${APP_DIR}" ]] || err "App directory missing: ${APP_DIR}"
[[ -f "${APP_DIR}/package.json" ]] || err "Not an OrbitDesk install: ${APP_DIR}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"
STAGING="${APP_DIR}.update-${STAMP}"
PREVIOUS="${APP_DIR}.previous"
ROLLED_BACK=0

cleanup_staging() {
  rm -rf "${STAGING}" 2>/dev/null || true
}

healthcheck() {
  local i
  for ((i=1; i<=HEALTH_RETRIES; i++)); do
    if curl -fsS --max-time 5 "${HEALTH_URL}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${HEALTH_SLEEP}"
  done
  return 1
}

rollback() {
  local reason="${1:-update failed}"
  warn "Rolling back — ${reason}"
  systemctl stop orbitdesk.service 2>/dev/null || true
  cleanup_staging

  if [[ -d "${PREVIOUS}" && -f "${PREVIOUS}/package.json" ]]; then
    rm -rf "${APP_DIR}"
    mv "${PREVIOUS}" "${APP_DIR}"
    chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
    systemctl daemon-reload
    systemctl start orbitdesk.service || true
    sleep 2
    if healthcheck; then
      ok "Rollback succeeded — previous version is running again"
    else
      warn "Files restored but health check still failing — check: journalctl -u orbitdesk -e"
    fi
    ROLLED_BACK=1
    return 0
  fi

  if [[ -f "${BACKUP_DIR}/app.tar.gz" ]]; then
    warn "Restoring from archive ${BACKUP_DIR}/app.tar.gz (may need rebuild)"
    rm -rf "${APP_DIR}"
    mkdir -p "${APP_DIR}"
    tar -xzf "${BACKUP_DIR}/app.tar.gz" -C "${APP_DIR}"
    cd "${APP_DIR}"
    if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
    npm run build
    chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
    systemctl daemon-reload
    systemctl start orbitdesk.service || true
    ROLLED_BACK=1
    ok "Restored from backup archive"
    return 0
  fi

  err "No backup available to roll back to"
}

prune_backups() {
  [[ -d "${BACKUP_ROOT}" ]] || return 0
  mapfile -t dirs < <(find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d | sort -r)
  local idx=0
  for d in "${dirs[@]}"; do
    idx=$((idx + 1))
    if (( idx > KEEP_BACKUPS )); then
      msg "Pruning old backup ${d}"
      rm -rf "${d}"
    fi
  done
}

resolve_repo() {
  if [[ -n "${REPO_URL}" ]]; then
    return
  fi
  if [[ -d "${APP_DIR}/.git" ]]; then
    REPO_URL="$(git -C "${APP_DIR}" remote get-url origin 2>/dev/null || true)"
  fi
  REPO_URL="${REPO_URL:-https://github.com/nasagreir/orbitdesk.git}"
}

create_backup() {
  msg "Creating backup at ${BACKUP_DIR}"
  mkdir -p "${BACKUP_DIR}" "${BACKUP_ROOT}"

  # Portable archive (source + env + data; rebuildable dirs omitted)
  tar -czf "${BACKUP_DIR}/app.tar.gz" \
    --exclude='./node_modules' \
    --exclude='./.next' \
    --exclude='./.git' \
    -C "${APP_DIR}" .

  # Fast rollback copy = exact running tree including node_modules + .next
  msg "Snapshotting live install for fast rollback"
  rm -rf "${PREVIOUS}"
  mkdir -p "${PREVIOUS}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "${APP_DIR}/" "${PREVIOUS}/"
  else
    tar -C "${APP_DIR}" -cf - . | tar -C "${PREVIOUS}" -xf -
  fi

  printf '%s\n' "${STAMP}" >"${BACKUP_DIR}/stamp.txt"
  ok "Backup ready"
}

deploy_staging() {
  resolve_repo
  msg "Fetching ${REPO_URL} @ ${REPO_BRANCH} into staging"
  rm -rf "${STAGING}"
  mkdir -p "${STAGING}"
  git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${STAGING}"

  if [[ -f "${APP_DIR}/.env.local" ]]; then
    cp -a "${APP_DIR}/.env.local" "${STAGING}/.env.local"
  fi
  if [[ -d "${APP_DIR}/data" ]]; then
    mkdir -p "${STAGING}/data"
    cp -a "${APP_DIR}/data/." "${STAGING}/data/"
  fi

  msg "Building staged release"
  cd "${STAGING}"
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
  npm run build
  [[ -d "${STAGING}/.next" ]] || err "Build produced no .next output"
}

swap_release() {
  msg "Stopping orbitdesk service"
  systemctl stop orbitdesk.service || true

  local live_tmp="${APP_DIR}.replacing-${STAMP}"
  mv "${APP_DIR}" "${live_tmp}"
  mv "${STAGING}" "${APP_DIR}"
  rm -rf "${live_tmp}"

  if [[ -f "${APP_DIR}/scripts/orbitdesk-user" ]]; then
    install -m 0755 "${APP_DIR}/scripts/orbitdesk-user" /usr/local/bin/orbitdesk-user
  fi
  if [[ -f "${APP_DIR}/scripts/orbitdesk-update" ]]; then
    install -m 0755 "${APP_DIR}/scripts/orbitdesk-update" /usr/local/bin/orbitdesk-update
  fi
  chmod +x "${APP_DIR}/scripts/orbitdesk-update.sh" || true

  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
  systemctl daemon-reload
  msg "Starting orbitdesk service"
  systemctl start orbitdesk.service
}

main() {
  msg "Updating OrbitDesk in ${APP_DIR}"
  create_backup

  if ! deploy_staging; then
    cleanup_staging
    err "Staging deploy/build failed — live app untouched (backup at ${BACKUP_DIR})"
  fi

  if ! swap_release; then
    rollback "failed to swap release"
    err "Update failed and was rolled back"
  fi

  msg "Waiting for health check (${HEALTH_URL})"
  if ! healthcheck; then
    rollback "new release failed health check"
    err "Update failed health check and was rolled back"
  fi

  prune_backups
  ok "Update complete — OrbitDesk is healthy on :${APP_PORT}"
  ok "Backup: ${BACKUP_DIR}  |  Fast rollback copy: ${PREVIOUS}"
}

trap 'status=$?; if [[ $status -ne 0 && ${ROLLED_BACK} -eq 0 ]]; then warn "Update aborted"; cleanup_staging; fi' EXIT
main "$@"
