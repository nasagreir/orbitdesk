# OrbitDesk on Proxmox

## Paste this on the Proxmox host (root)

One file: [`proxmox-install.sh`](../../proxmox-install.sh) at the repo root.

### One-liner (raw URL)

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/orbitdesk/main/proxmox-install.sh)"
```

Repo: https://github.com/nasagreir/orbitdesk

### Or paste the whole script

1. Open [`proxmox-install.sh`](../../proxmox-install.sh)
2. Paste the entire file into the Proxmox host shell and press Enter

### Or from a host clone

```bash
git clone https://github.com/nasagreir/orbitdesk.git /root/orbitdesk
bash /root/orbitdesk/proxmox-install.sh
```

(Local clone copies the tree into the CT without re-cloning from GitHub inside the CT.)

## After install

Open `http://<container-ip>:3456`

```bash
pct enter <CTID>
nano /opt/orbitdesk/.env.local
systemctl restart orbitdesk
```
