#!/usr/bin/env bash
# =============================================================================
# OrbitDesk — single pasteable Proxmox LXC installer
# =============================================================================
# Paste this entire file into a Proxmox VE host shell (as root), OR run:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/orbitdesk/main/proxmox-install.sh)"
#
# =============================================================================
set -euo pipefail

# --------------- edit these if you want non-interactive defaults -------------
ORBITDESK_REPO="${ORBITDESK_REPO:-https://github.com/nasagreir/orbitdesk.git}"
ORBITDESK_BRANCH="${ORBITDESK_BRANCH:-main}"
ORBITDESK_PORT="${ORBITDESK_PORT:-3456}"
ORBITDESK_CTID="${ORBITDESK_CTID:-}"
ORBITDESK_HOSTNAME="${ORBITDESK_HOSTNAME:-orbitdesk}"
ORBITDESK_CORES="${ORBITDESK_CORES:-2}"
ORBITDESK_MEMORY="${ORBITDESK_MEMORY:-2048}"
ORBITDESK_DISK="${ORBITDESK_DISK:-8}"
ORBITDESK_BRIDGE="${ORBITDESK_BRIDGE:-vmbr0}"
ORBITDESK_STORAGE="${ORBITDESK_STORAGE:-}"
ORBITDESK_UNPRIVILEGED="${ORBITDESK_UNPRIVILEGED:-1}"
HOME_ASSISTANT_URL="${HOME_ASSISTANT_URL:-}"
HOME_ASSISTANT_TOKEN="${HOME_ASSISTANT_TOKEN:-}"
GROK_API_KEY="${GROK_API_KEY:-}"
# -----------------------------------------------------------------------------

APP="OrbitDesk"
YW=$'\033[33m'; BL=$'\033[36m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; CL=$'\033[m'; BOLD=$'\033[1m'
msg_info() { echo -e "${BL}${BOLD}[INFO]${CL} $1"; }
msg_ok()   { echo -e "${GN}${BOLD}[OK]${CL} $1"; }
msg_warn() { echo -e "${YW}${BOLD}[WARN]${CL} $1"; }
msg_error(){ echo -e "${RD}${BOLD}[ERROR]${CL} $1"; exit 1; }

header() {
  clear 2>/dev/null || true
  cat <<EOF
${BOLD}${BL}
   ____       _     _ _   ____            _
  / __ \\     | |   (_) | |  _ \\          | |
 | |  | |_ __| |__  _| |_| | | | ___  ___| | __
 | |  | | '__| '_ \\| | __| | | |/ _ \\/ __| |/ /
 | |__| | |  | |_) | | |_| |_| |  __/\\__ \\   <
  \\____/|_|  |_.__/|_|\\__|____/ \\___||___/_|\\_\\
${CL}
  Single-file Proxmox LXC installer
EOF
}

need_proxmox() {
  [[ "${EUID}" -eq 0 ]] || msg_error "Run as root on the Proxmox host."
  command -v pveversion >/dev/null || msg_error "Not a Proxmox host (pveversion missing)."
  command -v pct >/dev/null || msg_error "pct missing."
}

prompt() {
  local var="$1" label="$2" default="$3" value
  read -r -p "${label} [${default}]: " value || true
  printf -v "${var}" '%s' "${value:-$default}"
}

confirm_yn() {
  local p="$1" d="${2:-y}" a
  read -r -p "${p} [${d}]: " a || true
  [[ "${a:-$d}" =~ ^[Yy]$ ]]
}

next_ctid() {
  local id=100
  while pct status "${id}" &>/dev/null || qm status "${id}" &>/dev/null 2>/dev/null; do
    id=$((id + 1))
  done
  echo "${id}"
}

default_storage() {
  if [[ -n "${ORBITDESK_STORAGE}" ]]; then
    echo "${ORBITDESK_STORAGE}"
    return
  fi
  pvesm status -content rootdir 2>/dev/null | awk 'NR>1 {print $1; exit}'
}

pick_template() {
  local storage="$1" template volid
  template="$(pveam list "${storage}" 2>/dev/null | awk '/debian-12-standard/ {print $1; exit}')"
  if [[ -z "${template}" ]]; then
    msg_info "Downloading Debian 12 template to ${storage}"
    pveam update >/dev/null
    volid="$(pveam available -section system 2>/dev/null | awk '/debian-12-standard/ {print $2; exit}')"
    [[ -n "${volid}" ]] || msg_error "debian-12-standard template not found."
    pveam download "${storage}" "${volid}"
    template="$(pveam list "${storage}" 2>/dev/null | awk '/debian-12-standard/ {print $1; exit}')"
  fi
  [[ -n "${template}" ]] || msg_error "Template missing on ${storage}."
  echo "${template}"
}

# Detect local checkout when this file lives inside the OrbitDesk repo
resolve_local() {
  LOCAL_MODE=0
  REPO_ROOT=""
  local source="${BASH_SOURCE[0]:-}"
  if [[ -n "${source}" && -f "${source}" ]]; then
    local dir root
    dir="$(cd "$(dirname "${source}")" && pwd)"
    root="${dir}"
    if [[ -f "${root}/package.json" ]] && grep -q '"name": "orbitdesk"' "${root}/package.json" 2>/dev/null; then
      LOCAL_MODE=1
      REPO_ROOT="${root}"
    fi
  fi
}

gather() {
  header
  echo
  msg_info "Creates a Debian 12 LXC and installs ${APP} on port ${ORBITDESK_PORT}."
  echo

  CTID="${ORBITDESK_CTID:-$(next_ctid)}"
  prompt CTID "LXC CT ID" "${CTID}"
  pct status "${CTID}" &>/dev/null && msg_error "CT ${CTID} already exists."

  prompt HN "Hostname" "${ORBITDESK_HOSTNAME}"
  prompt CORES "CPU cores" "${ORBITDESK_CORES}"
  prompt MEMORY "Memory (MiB)" "${ORBITDESK_MEMORY}"
  prompt DISK "Disk size (GiB)" "${ORBITDESK_DISK}"
  prompt BRIDGE "Bridge" "${ORBITDESK_BRIDGE}"

  STORAGE="$(default_storage)"
  [[ -n "${STORAGE}" ]] || msg_error "No storage with rootdir content."
  prompt STORAGE "Storage" "${STORAGE}"

  if [[ "${LOCAL_MODE}" -eq 1 ]]; then
    msg_ok "Local repo detected at ${REPO_ROOT} — will copy into the CT."
    SOURCE_MODE="local"
  else
    SOURCE_MODE="git"
    if [[ -z "${ORBITDESK_REPO}" ]]; then
      echo
      msg_warn "Set the Git URL the container can clone (public HTTPS or deploy-key/SSH)."
      prompt ORBITDESK_REPO "OrbitDesk git URL" ""
    fi
    [[ -n "${ORBITDESK_REPO}" ]] || msg_error "ORBITDESK_REPO is required when not run from a local clone."
    prompt ORBITDESK_BRANCH "Git branch" "${ORBITDESK_BRANCH}"
  fi

  echo
  msg_info "Optional integrations (Enter skips — demo mode still works)"
  prompt HOME_ASSISTANT_URL "Home Assistant URL" "${HOME_ASSISTANT_URL}"
  prompt HOME_ASSISTANT_TOKEN "Home Assistant token" "${HOME_ASSISTANT_TOKEN}"
  prompt GROK_API_KEY "Grok / xAI API key" "${GROK_API_KEY}"

  echo
  echo "  CT ${CTID} · ${HN} · ${CORES}c / ${MEMORY}M / ${DISK}G · ${BRIDGE} · ${SOURCE_MODE}"
  echo
  confirm_yn "Install ${APP} now?" "y" || msg_error "Aborted."
}

create_ct() {
  local template password=""
  template="$(pick_template "${STORAGE}")"
  msg_info "Creating CT ${CTID}"

  local -a args=(
    create "${CTID}" "${template}"
    --hostname "${HN}"
    --cores "${CORES}"
    --memory "${MEMORY}"
    --swap 512
    --rootfs "${STORAGE}:${DISK}"
    --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp"
    --unprivileged "${ORBITDESK_UNPRIVILEGED}"
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
  msg_ok "CT ${CTID} created"
  [[ -z "${password}" ]] || msg_warn "CT root password: ${password}"
}

start_ct() {
  msg_info "Starting CT ${CTID}"
  pct start "${CTID}"
  local i
  for i in $(seq 1 60); do
    if pct exec "${CTID}" -- bash -c 'hostname -I | grep -qE "[0-9]+\.[0-9]+"' 2>/dev/null; then
      msg_ok "Network is up"
      return
    fi
    sleep 2
  done
  msg_warn "No DHCP address yet — continuing"
}

# In-container installer (embedded — this file is the only thing you need)
write_ct_installer() {
  cat <<'CT_INSTALL_EOF'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/orbitdesk
APP_USER=orbitdesk
APP_PORT="${ORBITDESK_PORT:-3456}"
NODE_MAJOR="${ORBITDESK_NODE_MAJOR:-22}"
REPO_URL="${ORBITDESK_REPO:-}"
REPO_BRANCH="${ORBITDESK_BRANCH:-main}"
SOURCE_ARCHIVE="${ORBITDESK_SOURCE_ARCHIVE:-}"
export DEBIAN_FRONTEND=noninteractive
msg(){ echo -e "\033[1;36m[orbitdesk]\033[0m $*"; }
err(){ echo -e "\033[1;31m[orbitdesk]\033[0m $*" >&2; exit 1; }
[[ "${EUID}" -eq 0 ]] || err "must be root in CT"

msg "Installing base packages"
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl git gnupg jq build-essential python3 tar tini

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v//;s/\..*//')" -lt "${NODE_MAJOR}" ]]; then
  msg "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v; npm -v

id -u "${APP_USER}" &>/dev/null || useradd --system --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
mkdir -p "${APP_DIR}"

# Prefer the dedicated updater when OrbitDesk is already installed
if [[ -f "${APP_DIR}/package.json" && -x "${APP_DIR}/scripts/orbitdesk-update.sh" && -z "${SOURCE_ARCHIVE}" && -n "${REPO_URL}" ]]; then
  msg "Existing install detected — using orbitdesk-update (backup + rollback)"
  install -m 0755 "${APP_DIR}/scripts/orbitdesk-update" /usr/local/bin/orbitdesk-update 2>/dev/null || true
  ORBITDESK_REPO="${REPO_URL}" ORBITDESK_BRANCH="${REPO_BRANCH}" ORBITDESK_PORT="${APP_PORT}" \
    bash "${APP_DIR}/scripts/orbitdesk-update.sh" --repo "${REPO_URL}" --branch "${REPO_BRANCH}" --port "${APP_PORT}"
  exit 0
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_ROOT=/var/backups/orbitdesk
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"
PREVIOUS="${APP_DIR}.previous"
STAGING="${APP_DIR}.staging-${STAMP}"
HAD_PRIOR=0

if [[ -f "${APP_DIR}/package.json" ]]; then
  HAD_PRIOR=1
  msg "Backing up existing install before redeploy"
  mkdir -p "${BACKUP_DIR}"
  tar -czf "${BACKUP_DIR}/app.tar.gz" \
    --exclude='./node_modules' --exclude='./.next' --exclude='./.git' \
    -C "${APP_DIR}" . || true
  rm -rf "${PREVIOUS}"
  mkdir -p "${PREVIOUS}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "${APP_DIR}/" "${PREVIOUS}/"
  else
    tar -C "${APP_DIR}" -cf - . | tar -C "${PREVIOUS}" -xf -
  fi
fi

env_backup=""
data_backup=""
[[ -f "${APP_DIR}/.env.local" ]] && { env_backup=$(mktemp); cp "${APP_DIR}/.env.local" "${env_backup}"; }
[[ -d "${APP_DIR}/data" ]] && { data_backup=$(mktemp -d); cp -a "${APP_DIR}/data/." "${data_backup}/"; }

rollback_prior() {
  msg "Deploy/build failed — rolling back to previous install"
  systemctl stop orbitdesk.service 2>/dev/null || true
  rm -rf "${STAGING}" "${APP_DIR}"
  if [[ -d "${PREVIOUS}" ]]; then
    mv "${PREVIOUS}" "${APP_DIR}"
    chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
    systemctl start orbitdesk.service 2>/dev/null || true
    msg "Rollback complete"
  fi
  exit 1
}

rm -rf "${STAGING}"
mkdir -p "${STAGING}"
if [[ -n "${SOURCE_ARCHIVE}" && -f "${SOURCE_ARCHIVE}" ]]; then
  msg "Extracting ${SOURCE_ARCHIVE}"
  tar -xzf "${SOURCE_ARCHIVE}" -C "${STAGING}"
elif [[ -n "${REPO_URL}" ]]; then
  msg "Cloning ${REPO_URL} (${REPO_BRANCH})"
  git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${STAGING}"
else
  err "No ORBITDESK_REPO or source archive"
fi
[[ -f "${STAGING}/package.json" ]] || err "package.json missing after deploy"
[[ -n "${env_backup}" ]] && mv "${env_backup}" "${STAGING}/.env.local"
if [[ -n "${data_backup}" ]]; then
  mkdir -p "${STAGING}/data"
  cp -a "${data_backup}/." "${STAGING}/data/"
  rm -rf "${data_backup}"
fi

AUTH_SECRET_VALUE="$(openssl rand -hex 32)"
if [[ ! -f "${STAGING}/.env.local" ]]; then
  cat >"${STAGING}/.env.local" <<EOF
HOME_ASSISTANT_URL=${HOME_ASSISTANT_URL:-}
HOME_ASSISTANT_TOKEN=${HOME_ASSISTANT_TOKEN:-}
STARLINK_ENTITY_PREFIX=${STARLINK_ENTITY_PREFIX:-sensor.starlink}
GROK_API_KEY=${GROK_API_KEY:-}
POLL_INTERVAL_SECONDS=${POLL_INTERVAL_SECONDS:-30}
AUTH_SECRET=${AUTH_SECRET_VALUE}
ORBITDESK_DATA_DIR=${APP_DIR}/data
EOF
  chmod 640 "${STAGING}/.env.local"
else
  grep -q '^AUTH_SECRET=' "${STAGING}/.env.local" || echo "AUTH_SECRET=${AUTH_SECRET_VALUE}" >>"${STAGING}/.env.local"
  grep -q '^ORBITDESK_DATA_DIR=' "${STAGING}/.env.local" || echo "ORBITDESK_DATA_DIR=${APP_DIR}/data" >>"${STAGING}/.env.local"
fi

msg "Building OrbitDesk"
cd "${STAGING}"
if ! { if [[ -f package-lock.json ]]; then npm ci; else npm install; fi; npm run build; }; then
  if [[ "${HAD_PRIOR}" -eq 1 ]]; then rollback_prior; fi
  err "Build failed"
fi

systemctl stop orbitdesk.service 2>/dev/null || true
rm -rf "${APP_DIR}"
mv "${STAGING}" "${APP_DIR}"

mkdir -p "${APP_DIR}/data"
chmod 750 "${APP_DIR}/data"

install -m 0755 "${APP_DIR}/scripts/orbitdesk-user" /usr/local/bin/orbitdesk-user
install -m 0755 "${APP_DIR}/scripts/orbitdesk-update" /usr/local/bin/orbitdesk-update
chmod +x "${APP_DIR}/scripts/orbitdesk-user.mjs" "${APP_DIR}/scripts/orbitdesk-update.sh" || true

# First-start uses the /setup landing page — do not auto-create users
export ORBITDESK_DATA_DIR="${APP_DIR}/data"
if [[ -f "${APP_DIR}/data/users.json" ]] && grep -q '"username"' "${APP_DIR}/data/users.json" 2>/dev/null; then
  msg "Existing OrbitDesk users preserved"
else
  msg "No users yet — open the app and complete first-start setup"
fi

cat >/etc/systemd/system/orbitdesk.service <<EOF
[Unit]
Description=OrbitDesk Starlink Ops Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=ORBITDESK_DATA_DIR=${APP_DIR}/data
EnvironmentFile=-${APP_DIR}/.env.local
ExecStart=/usr/bin/npm run start -- --port ${APP_PORT} --hostname 0.0.0.0
Restart=on-failure
RestartSec=5
TimeoutStartSec=120
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
systemctl daemon-reload
systemctl enable --now orbitdesk.service
sleep 2
systemctl --no-pager --full status orbitdesk.service || true
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
msg "Installed — http://${IP:-<ct-ip>}:${APP_PORT}"
msg "First start: open the URL and create your username / password"
msg "Config: ${APP_DIR}/.env.local"
msg "Update: orbitdesk-update   (backs up + auto-rolls back on failure)"
msg "Users:  orbitdesk-user list | reset-password <user>"
CT_INSTALL_EOF
}

push_and_install() {
  local remote=/tmp/orbitdesk-ct-install.sh
  local local_install
  local_install="$(mktemp)"
  write_ct_installer >"${local_install}"
  pct push "${CTID}" "${local_install}" "${remote}"
  pct exec "${CTID}" -- chmod +x "${remote}"
  rm -f "${local_install}"

  local -a env_vars=(
    "ORBITDESK_PORT=${ORBITDESK_PORT}"
    "ORBITDESK_BRANCH=${ORBITDESK_BRANCH}"
    "HOME_ASSISTANT_URL=${HOME_ASSISTANT_URL}"
    "HOME_ASSISTANT_TOKEN=${HOME_ASSISTANT_TOKEN}"
    "GROK_API_KEY=${GROK_API_KEY}"
  )

  if [[ "${SOURCE_MODE}" == "local" ]]; then
    local archive="/var/tmp/orbitdesk-${CTID}.tar.gz"
    msg_info "Packaging local source"
    tar -czf "${archive}" \
      --exclude='./node_modules' --exclude='./.next' --exclude='./.git' --exclude='./.cursor' \
      -C "${REPO_ROOT}" .
    pct push "${CTID}" "${archive}" /tmp/orbitdesk-src.tar.gz
    rm -f "${archive}"
    env_vars+=("ORBITDESK_SOURCE_ARCHIVE=/tmp/orbitdesk-src.tar.gz")
  else
    env_vars+=("ORBITDESK_REPO=${ORBITDESK_REPO}")
  fi

  msg_info "Installing inside CT ${CTID} (several minutes)"
  pct exec "${CTID}" -- env "${env_vars[@]}" bash "${remote}"
  msg_ok "${APP} installed"
}

done_msg() {
  local ip
  ip="$(pct exec "${CTID}" -- hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  msg_ok "${APP} is ready"
  echo "  URL    : http://${ip:-<ct-ip>}:${ORBITDESK_PORT}"
  echo "  Setup  : open the URL and create your username / password"
  echo "  Update : pct enter ${CTID}  then  orbitdesk-update"
  echo "  CT ID  : ${CTID}"
  echo "  Shell  : pct enter ${CTID}"
  echo "  Logs   : pct exec ${CTID} -- journalctl -u orbitdesk -f"
  echo "  Env    : /opt/orbitdesk/.env.local"
}

main() {
  need_proxmox
  resolve_local
  gather
  create_ct
  start_ct
  push_and_install
  done_msg
}

main "$@"
