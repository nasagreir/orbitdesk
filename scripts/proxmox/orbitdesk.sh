#!/usr/bin/env bash
# OrbitDesk Proxmox VE helper — run on the Proxmox HOST
#
# From a local clone (recommended):
#   bash scripts/proxmox/orbitdesk.sh
#
# One-liner when the repo is reachable over HTTP(S):
#   ORBITDESK_REPO=https://github.com/you/orbitdesk.git \
#     bash -c "$(curl -fsSL https://raw.githubusercontent.com/you/orbitdesk/main/scripts/proxmox/orbitdesk.sh)"
#
set -euo pipefail

APP="OrbitDesk"
APP_SLUG="orbitdesk"
APP_PORT="${ORBITDESK_PORT:-3456}"
DEFAULT_CTID="${ORBITDESK_CTID:-}"
DEFAULT_HOSTNAME="${ORBITDESK_HOSTNAME:-orbitdesk}"
DEFAULT_CORES="${ORBITDESK_CORES:-2}"
DEFAULT_MEMORY="${ORBITDESK_MEMORY:-2048}"
DEFAULT_DISK="${ORBITDESK_DISK:-8}"
DEFAULT_BRIDGE="${ORBITDESK_BRIDGE:-vmbr0}"
DEFAULT_STORAGE="${ORBITDESK_STORAGE:-}"
DEFAULT_TEMPLATE="${ORBITDESK_TEMPLATE:-debian-12-standard}"
REPO_URL="${ORBITDESK_REPO:-}"
REPO_BRANCH="${ORBITDESK_BRANCH:-main}"
UNPRIVILEGED="${ORBITDESK_UNPRIVILEGED:-1}"

YW=$'\033[33m'
BL=$'\033[36m'
GN=$'\033[1;92m'
RD=$'\033[01;31m'
CL=$'\033[m'
BOLD=$'\033[1m'

msg_info() { echo -e "${BL}${BOLD}[INFO]${CL} $1"; }
msg_ok() { echo -e "${GN}${BOLD}[OK]${CL} $1"; }
msg_warn() { echo -e "${YW}${BOLD}[WARN]${CL} $1"; }
msg_error() { echo -e "${RD}${BOLD}[ERROR]${CL} $1"; exit 1; }

header() {
  clear
  cat <<EOF
${BOLD}${BL}
   ____       _     _ _   ____            _
  / __ \\     | |   (_) | |  _ \\          | |
 | |  | |_ __| |__  _| |_| | | | ___  ___| | __
 | |  | | '__| '_ \\| | __| | | |/ _ \\/ __| |/ /
 | |__| | |  | |_) | | |_| |_| |  __/\\__ \\   <
  \\____/|_|  |_.__/|_|\\__|____/ \\___||___/_|\\_\\
${CL}
  Proxmox LXC installer for ${APP}
  Starlink · Home Assistant · Grok
EOF
}

need_proxmox() {
  if [[ "${EUID}" -ne 0 ]]; then
    msg_error "Run this script as root on the Proxmox host."
  fi
  if ! command -v pveversion >/dev/null 2>&1; then
    msg_error "pveversion not found — this helper must run on a Proxmox VE host."
  fi
  if ! command -v pct >/dev/null 2>&1; then
    msg_error "pct not found — install Proxmox VE container tools."
  fi
}

resolve_script_paths() {
  local source="${BASH_SOURCE[0]:-}"
  SCRIPT_DIR=""
  REPO_ROOT=""
  LOCAL_MODE=0

  if [[ -n "${source}" && "${source}" != "bash" && "${source}" != "-" && -f "${source}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${source}")" && pwd)"
    REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
    if [[ -f "${REPO_ROOT}/package.json" ]] && grep -q '"name": "orbitdesk"' "${REPO_ROOT}/package.json" 2>/dev/null; then
      LOCAL_MODE=1
    fi
  fi
}

next_ctid() {
  local id=100
  while pct status "${id}" &>/dev/null || qm status "${id}" &>/dev/null 2>/dev/null; do
    id=$((id + 1))
  done
  echo "${id}"
}

default_storage() {
  if [[ -n "${DEFAULT_STORAGE}" ]]; then
    echo "${DEFAULT_STORAGE}"
    return
  fi
  pvesm status -content rootdir 2>/dev/null | awk 'NR>1 {print $1; exit}'
}

pick_template() {
  local storage="$1"
  local template
  template="$(pveam list "${storage}" 2>/dev/null | awk -v t="${DEFAULT_TEMPLATE}" 'NR>1 && $1 ~ t {print $1; exit}')"
  if [[ -z "${template}" ]]; then
    msg_info "Downloading Debian 12 template to ${storage}"
    pveam update >/dev/null
    local volid
    volid="$(pveam available -section system 2>/dev/null | awk '/debian-12-standard/ {print $2; exit}')"
    [[ -n "${volid}" ]] || msg_error "Could not find debian-12-standard template."
    pveam download "${storage}" "${volid}"
    template="$(pveam list "${storage}" 2>/dev/null | awk '/debian-12-standard/ {print $1; exit}')"
  fi
  [[ -n "${template}" ]] || msg_error "Debian 12 template missing on storage ${storage}."
  echo "${template}"
}

prompt() {
  local var="$1" label="$2" default="$3"
  local value
  read -r -p "${label} [${default}]: " value || true
  value="${value:-$default}"
  printf -v "${var}" '%s' "${value}"
}

confirm_yn() {
  local prompt_text="$1" default="${2:-y}" answer
  read -r -p "${prompt_text} [${default}]: " answer || true
  answer="${answer:-$default}"
  [[ "${answer}" =~ ^[Yy]$ ]]
}

gather_settings() {
  header
  echo
  msg_info "This will create a Debian 12 LXC and install ${APP}."
  echo

  CTID="${DEFAULT_CTID:-$(next_ctid)}"
  prompt CTID "LXC CT ID" "${CTID}"
  if pct status "${CTID}" &>/dev/null; then
    msg_error "CT ${CTID} already exists."
  fi

  prompt HN "Hostname" "${DEFAULT_HOSTNAME}"
  prompt CORES "CPU cores" "${DEFAULT_CORES}"
  prompt MEMORY "Memory (MiB)" "${DEFAULT_MEMORY}"
  prompt DISK "Disk size (GiB)" "${DEFAULT_DISK}"
  prompt BRIDGE "Bridge" "${DEFAULT_BRIDGE}"

  STORAGE="$(default_storage)"
  [[ -n "${STORAGE}" ]] || msg_error "No storage with rootdir content found."
  prompt STORAGE "Storage" "${STORAGE}"

  if [[ "${LOCAL_MODE}" -eq 1 ]]; then
    msg_ok "Detected local repo at ${REPO_ROOT} — will copy into the container."
    SOURCE_MODE="local"
  else
    if [[ -z "${REPO_URL}" ]]; then
      echo
      msg_warn "No local checkout detected (script was likely pasted/curled)."
      prompt REPO_URL "Git clone URL for OrbitDesk" ""
      [[ -n "${REPO_URL}" ]] || msg_error "ORBITDESK_REPO / Git URL is required when not run from a local clone."
    fi
    prompt REPO_BRANCH "Git branch" "${REPO_BRANCH}"
    SOURCE_MODE="git"
  fi

  echo
  msg_info "Optional integrations (Enter to skip — demo mode works without them)"
  prompt HOME_ASSISTANT_URL "Home Assistant URL" "${HOME_ASSISTANT_URL:-}"
  prompt HOME_ASSISTANT_TOKEN "Home Assistant token" "${HOME_ASSISTANT_TOKEN:-}"
  prompt GROK_API_KEY "Grok / xAI API key" "${GROK_API_KEY:-}"

  echo
  echo "  CT ID     : ${CTID}"
  echo "  Hostname  : ${HN}"
  echo "  Resources : ${CORES} cores / ${MEMORY} MiB / ${DISK} GiB"
  echo "  Network   : ${BRIDGE}"
  echo "  Storage   : ${STORAGE}"
  echo "  Source    : ${SOURCE_MODE}"
  echo "  Port      : ${APP_PORT}"
  echo
  confirm_yn "Create LXC and install ${APP}?" "y" || msg_error "Aborted."
}

create_container() {
  local template password=""
  template="$(pick_template "${STORAGE}")"
  msg_info "Creating CT ${CTID} from ${template}"

  local -a args=(
    create "${CTID}" "${template}"
    --hostname "${HN}"
    --cores "${CORES}"
    --memory "${MEMORY}"
    --swap 512
    --rootfs "${STORAGE}:${DISK}"
    --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp"
    --unprivileged "${UNPRIVILEGED}"
    --features nesting=1
    --onboot 1
    --ostype debian
  )

  if [[ -f /root/.ssh/authorized_keys ]]; then
    args+=(--ssh-public-keys /root/.ssh/authorized_keys)
  else
    password="$(openssl rand -base64 18)"
    args+=(--password "${password}")
  fi

  pct "${args[@]}" >/dev/null
  msg_ok "Container ${CTID} created"
  if [[ -n "${password}" ]]; then
    msg_warn "Root password for CT ${CTID}: ${password}"
  fi
}

start_and_wait() {
  msg_info "Starting CT ${CTID}"
  pct start "${CTID}"
  local i
  for i in $(seq 1 60); do
    if pct exec "${CTID}" -- bash -c 'hostname -I | grep -qE "[0-9]+\.[0-9]+"' 2>/dev/null; then
      msg_ok "Container network is up"
      return
    fi
    sleep 2
  done
  msg_warn "Network not detected yet — continuing anyway"
}

write_embedded_bootstrap() {
  local out="$1"
  cat >"${out}" <<'EMBEDDED_INSTALL'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/orbitdesk
REPO_URL="${ORBITDESK_REPO:?ORBITDESK_REPO required}"
REPO_BRANCH="${ORBITDESK_BRANCH:-main}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl git tar
rm -rf "${APP_DIR}"
git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${APP_DIR}"
[[ -f "${APP_DIR}/scripts/proxmox/ct-install.sh" ]] || {
  echo "Repo is missing scripts/proxmox/ct-install.sh" >&2
  exit 1
}
tar -czf /tmp/orbitdesk-src.tar.gz -C "${APP_DIR}" .
ORBITDESK_SOURCE_ARCHIVE=/tmp/orbitdesk-src.tar.gz \
  bash "${APP_DIR}/scripts/proxmox/ct-install.sh"
EMBEDDED_INSTALL
}

push_install_assets() {
  local install_src remote_install="/tmp/orbitdesk-ct-install.sh"
  local archive="/var/tmp/${APP_SLUG}-${CTID}.tar.gz"
  local cleanup_install=0

  if [[ "${LOCAL_MODE}" -eq 1 ]]; then
    install_src="${SCRIPT_DIR}/ct-install.sh"
    [[ -f "${install_src}" ]] || msg_error "Missing ${install_src}"
    msg_info "Packaging local source from ${REPO_ROOT}"
    tar -czf "${archive}" \
      --exclude='./node_modules' \
      --exclude='./.next' \
      --exclude='./.git' \
      --exclude='./.cursor' \
      -C "${REPO_ROOT}" .
    pct push "${CTID}" "${archive}" /tmp/orbitdesk-src.tar.gz
    rm -f "${archive}"
  else
    if [[ -n "${SCRIPT_DIR}" && -f "${SCRIPT_DIR}/ct-install.sh" ]]; then
      install_src="${SCRIPT_DIR}/ct-install.sh"
    else
      install_src="$(mktemp)"
      cleanup_install=1
      write_embedded_bootstrap "${install_src}"
    fi
  fi

  pct push "${CTID}" "${install_src}" "${remote_install}"
  pct exec "${CTID}" -- chmod +x "${remote_install}"
  if [[ "${cleanup_install}" -eq 1 ]]; then
    rm -f "${install_src}"
  fi
}

run_install() {
  msg_info "Installing ${APP} inside CT ${CTID} (this may take several minutes)"
  local -a env_vars=(
    "ORBITDESK_PORT=${APP_PORT}"
    "ORBITDESK_BRANCH=${REPO_BRANCH}"
    "HOME_ASSISTANT_URL=${HOME_ASSISTANT_URL:-}"
    "HOME_ASSISTANT_TOKEN=${HOME_ASSISTANT_TOKEN:-}"
    "GROK_API_KEY=${GROK_API_KEY:-}"
  )

  if [[ "${SOURCE_MODE}" == "git" ]]; then
    env_vars+=("ORBITDESK_REPO=${REPO_URL}")
  else
    env_vars+=("ORBITDESK_SOURCE_ARCHIVE=/tmp/orbitdesk-src.tar.gz")
  fi

  pct exec "${CTID}" -- env "${env_vars[@]}" bash /tmp/orbitdesk-ct-install.sh
  msg_ok "${APP} installed"
}

show_done() {
  local ip
  ip="$(pct exec "${CTID}" -- hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  msg_ok "${APP} LXC is ready"
  echo "  CT ID  : ${CTID}"
  echo "  Name   : ${HN}"
  echo "  URL    : http://${ip:-<ct-ip>}:${APP_PORT}"
  echo "  Shell  : pct enter ${CTID}"
  echo "  Logs   : pct exec ${CTID} -- journalctl -u orbitdesk -f"
  echo "  Env    : /opt/orbitdesk/.env.local"
  echo
  echo "Update later from a local clone:"
  echo "  bash scripts/proxmox/orbitdesk.sh update ${CTID}"
}

cmd_update() {
  local ctid="${1:-}"
  [[ -n "${ctid}" ]] || msg_error "Usage: $0 update <CTID>"
  pct status "${ctid}" &>/dev/null || msg_error "CT ${ctid} not found"
  resolve_script_paths

  if [[ "${LOCAL_MODE}" -eq 1 ]]; then
    local archive="/var/tmp/${APP_SLUG}-update-${ctid}.tar.gz"
    msg_info "Pushing local source into CT ${ctid}"
    tar -czf "${archive}" \
      --exclude='./node_modules' \
      --exclude='./.next' \
      --exclude='./.git' \
      --exclude='./.cursor' \
      -C "${REPO_ROOT}" .
    pct push "${ctid}" "${archive}" /tmp/orbitdesk-src.tar.gz
    pct push "${ctid}" "${SCRIPT_DIR}/ct-install.sh" /tmp/orbitdesk-ct-install.sh
    rm -f "${archive}"
    pct exec "${ctid}" -- chmod +x /tmp/orbitdesk-ct-install.sh
    pct exec "${ctid}" -- env \
      ORBITDESK_SOURCE_ARCHIVE=/tmp/orbitdesk-src.tar.gz \
      ORBITDESK_PORT="${APP_PORT}" \
      bash /tmp/orbitdesk-ct-install.sh
  else
    [[ -n "${REPO_URL}" ]] || msg_error "Set ORBITDESK_REPO for remote updates, or run from a local clone."
    pct exec "${ctid}" -- env \
      ORBITDESK_REPO="${REPO_URL}" \
      ORBITDESK_BRANCH="${REPO_BRANCH}" \
      ORBITDESK_PORT="${APP_PORT}" \
      bash -c 'set -euo pipefail
        cd /opt/orbitdesk
        if [[ -d .git ]]; then
          git remote set-url origin "$ORBITDESK_REPO"
          git fetch origin "$ORBITDESK_BRANCH"
          git reset --hard "origin/$ORBITDESK_BRANCH"
        else
          echo "No git checkout in /opt/orbitdesk; re-run install from a local clone." >&2
          exit 1
        fi
        if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
        npm run build
        systemctl restart orbitdesk'
  fi
  msg_ok "Updated CT ${ctid}"
}

cmd_install() {
  need_proxmox
  resolve_script_paths
  gather_settings
  create_container
  start_and_wait
  push_install_assets
  run_install
  show_done
}

usage() {
  cat <<EOF
Usage: $0 [install|update <CTID>|help]

  install          Create a new LXC and install OrbitDesk (default)
  update <CTID>    Rebuild/update OrbitDesk inside an existing CT
  help             Show this help

Environment overrides:
  ORBITDESK_CTID ORBITDESK_HOSTNAME ORBITDESK_CORES ORBITDESK_MEMORY
  ORBITDESK_DISK ORBITDESK_BRIDGE ORBITDESK_STORAGE ORBITDESK_PORT
  ORBITDESK_REPO ORBITDESK_BRANCH ORBITDESK_UNPRIVILEGED
  HOME_ASSISTANT_URL HOME_ASSISTANT_TOKEN GROK_API_KEY
EOF
}

main() {
  local action="${1:-install}"
  case "${action}" in
    install|"")
      cmd_install
      ;;
    update)
      need_proxmox
      cmd_update "${2:-}"
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
