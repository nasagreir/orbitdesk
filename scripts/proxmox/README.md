# OrbitDesk on Proxmox (LXC helper)

Install OrbitDesk as a Debian 12 LXC from the Proxmox **host** shell — same idea as community helper scripts.

## Paste into the Proxmox host

### Option A — clone on the host (best for private repos)

```bash
git clone <YOUR_ORBITDESK_GIT_URL> /root/orbitdesk
cd /root/orbitdesk
bash scripts/proxmox/orbitdesk.sh
```

The helper copies this checkout into the container (no public raw URL required).

### Option B — one-liner from a raw URL

When `scripts/proxmox/orbitdesk.sh` is reachable over HTTPS:

```bash
ORBITDESK_REPO=https://github.com/YOU/orbitdesk.git \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/YOU/orbitdesk/main/scripts/proxmox/orbitdesk.sh)"
```

You will be prompted for CT ID, resources, bridge, storage, and optional Home Assistant / Grok credentials.

## Defaults

| Setting | Default |
| --- | --- |
| OS | Debian 12 |
| Cores | 2 |
| Memory | 2048 MiB |
| Disk | 8 GiB |
| Bridge | `vmbr0` |
| Nesting | enabled |
| App port | `3456` |
| App path | `/opt/orbitdesk` |
| Service | `orbitdesk.service` |

Override with env vars: `ORBITDESK_CTID`, `ORBITDESK_HOSTNAME`, `ORBITDESK_CORES`, `ORBITDESK_MEMORY`, `ORBITDESK_DISK`, `ORBITDESK_BRIDGE`, `ORBITDESK_STORAGE`, `ORBITDESK_PORT`, `ORBITDESK_REPO`, `ORBITDESK_BRANCH`.

## After install

```bash
pct enter <CTID>
systemctl status orbitdesk
nano /opt/orbitdesk/.env.local
systemctl restart orbitdesk
```

Open `http://<container-ip>:3456`.

## Update

From a host checkout:

```bash
cd /root/orbitdesk
git pull
bash scripts/proxmox/orbitdesk.sh update <CTID>
```

## Files

| Script | Role |
| --- | --- |
| `orbitdesk.sh` | Proxmox host helper — create LXC, push source, run install |
| `ct-install.sh` | Inside-CT install — Node, build, systemd |
