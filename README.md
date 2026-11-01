# OrbitDesk

Starlink operations dashboard with Home Assistant telemetry and a Grok (xAI) assistant.

## Features

- Fleet overview for one or more Starlink dishes (throughput, latency, obstruction, uptime)
- History tab (24h / 7d / 14d) with fleet charts, per-dish stats, and Grok-suggested improvements
- Fluid responsive layout (mobile ↔ desktop on resize) plus iPhone Duo inner-display / fold support
- Transparent product cutouts for each dish model (Mini, Gen 2/3, High Performance, Flat HP)
- Mini **travel / roam** mode — trip notes, and offline/down alarming is paused while traveling
- Device actions: reboot / stow / unstow via Home Assistant button entities
- Grok ops chat grounded in the current dish snapshot
- First-start landing page to choose your username and password
- Username/password login with LXC CLI password recovery
- Safe updates: `update` backs up first and auto-rolls back if the new build fails
- Dark + super dark themes
- Demo mode when credentials are missing so you can explore the UI immediately
- Single pasteable Proxmox LXC installer

## Install on Proxmox (paste this)

Repo: [github.com/nasagreir/orbitdesk](https://github.com/nasagreir/orbitdesk)

On the **Proxmox host** as root — one script, one paste:

```bash
# Fully automatic (recommended)
bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/orbitdesk/main/proxmox-install.sh)" -- --yes

# Or interactive prompts
bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/orbitdesk/main/proxmox-install.sh)"
```

The installer auto-picks **template storage** (`local` / vztmpl) separately from **rootfs storage** (`local-lvm` / rootdir), so LVM-thin hosts no longer fail with “storage does not support templates”. It clones `https://github.com/nasagreir/orbitdesk.git` (branch `main`) unless you override `ORBITDESK_REPO`.

Creates a Debian 12 LXC, builds OrbitDesk, and enables `orbitdesk.service` on port **3456**. Open the URL and create your operator username / password on the first-start page.

### Update (LXC CLI)

```bash
pct enter CTID
update
# optional: update --branch main
```

`orbitdesk-update` still works as an alias.

The updater snapshots the live install under `/var/backups/orbitdesk/` and `/opt/orbitdesk.previous`, builds the new release in staging, swaps it in, then health-checks `http://127.0.0.1:3456/api/auth/me`. If the build or health check fails, it restores the previous version automatically.

### Password recovery (LXC CLI)

```bash
pct enter CTID
orbitdesk-user list
orbitdesk-user reset-password ghull
# or: orbitdesk-user create ghull
```

Type the username by itself. `<ghull>` is shell redirection and will fail with `syntax error near unexpected token`.

## Quick start (local)

```bash
npm install
cp .env.example .env.local
# set AUTH_SECRET in .env.local
npm run dev -- --port 3456
```

Open [http://localhost:3456](http://localhost:3456) — with no users yet you’ll land on the setup page to choose a username and password.

## Connect Home Assistant

1. Install the **Starlink** integration in Home Assistant so dish sensors appear (`sensor.starlink_*`).
2. Create a long-lived access token in your HA profile.
3. Set in `.env.local` (or `/opt/orbitdesk/.env.local` on Proxmox):

```env
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=your-token
```

## Connect Grok

```env
GROK_API_KEY=xai-...
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev -- --port 3456` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve on `0.0.0.0:3456` |
| `npm run user -- create admin` | Create login user (CLI) |
| `npm run user -- reset-password admin` | Recover password |
| `update` | Update with backup + auto-rollback (LXC) |
| `bash proxmox-install.sh` | Pasteable Proxmox LXC installer |

## Notes

- Model thumbnails are transparent PNGs (Gen 2 / Gen 3 cutouts derived from [pngimg.com Starlink gallery](https://pngimg.com/images/electronics/starlink), CC BY-NC 4.0).
- Secrets stay server-side; the browser only talks to OrbitDesk API routes.
- If HA is configured but unreachable (or no Starlink entities exist), the UI falls back to demo dishes and surfaces the connection message.
- Layout covers Safari’s Duo viewport range (~382–951 CSS px): bottom nav on phones, two-pane fleet/Grok from ~720px, hinge-aware gutters on the Duo inner display, and Viewport Segments / Device Posture when those Safari feature flags are on.
