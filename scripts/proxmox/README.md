# OrbitDesk on Proxmox

## Paste this on the Proxmox host (root)

One file: [`proxmox-install.sh`](../../proxmox-install.sh) at the repo root.

### One-liner (raw URL)

```bash
ORBITDESK_REPO=https://github.com/YOU/orbitdesk.git \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/YOU/orbitdesk/main/proxmox-install.sh)"
```

Replace the GitHub URLs with yours (or any HTTPS raw URL that serves `proxmox-install.sh`).

### Or paste the whole script

1. Open `proxmox-install.sh`
2. Optionally set `ORBITDESK_REPO=...` near the top
3. Paste the entire file into the Proxmox host shell and press Enter

### Or from a host clone

```bash
git clone <YOUR_ORBITDESK_GIT_URL> /root/orbitdesk
bash /root/orbitdesk/proxmox-install.sh
```

(Local clone copies the tree into the CT — no public git URL required.)

## After install

Open `http://<container-ip>:3456`

```bash
pct enter <CTID>
nano /opt/orbitdesk/.env.local
systemctl restart orbitdesk
```
