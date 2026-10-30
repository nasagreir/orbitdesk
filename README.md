# OrbitDesk

Starlink operations dashboard with Home Assistant telemetry and a Grok (xAI) assistant.

## Features

- Fleet overview for one or more Starlink dishes (throughput, latency, obstruction, uptime)
- Transparent product cutouts for each dish model (Mini, Gen 2/3, High Performance, Flat HP) so thumbnails sit cleanly on dark / super-dark themes
- Mini **travel / roam** mode — trip notes, and offline/down alarming is paused while traveling
- Device actions: reboot / stow / unstow via Home Assistant button entities
- Grok ops chat grounded in the current dish snapshot
- Username/password login with LXC CLI password recovery
- Dark + super dark themes
- Demo mode when credentials are missing so you can explore the UI immediately
- Single pasteable Proxmox LXC installer

## Install on Proxmox (paste this)

On the **Proxmox host** as root — one script, one paste:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/orbitdesk/main/proxmox-install.sh)"
```

Repo: [github.com/nasagreir/orbitdesk](https://github.com/nasagreir/orbitdesk).

Creates a Debian 12 LXC, builds OrbitDesk, enables `orbitdesk.service` on port **3456**, and prints an initial `admin` password.

### Password recovery (LXC CLI)

```bash
pct enter <CTID>
orbitdesk-user reset-password admin
# or: orbitdesk-user create alice
# or: orbitdesk-user list
```

## Quick start (local)

```bash
npm install
cp .env.example .env.local
# set AUTH_SECRET in .env.local
npm run user -- create admin
npm run dev -- --port 3456
```

Open [http://localhost:3456](http://localhost:3456).

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
| `npm run user -- create admin` | Create login user |
| `npm run user -- reset-password admin` | Recover password |
| `bash proxmox-install.sh` | Pasteable Proxmox LXC installer |

## Notes

- Model thumbnails are transparent PNGs (Gen 2 / Gen 3 cutouts derived from [pngimg.com Starlink gallery](https://pngimg.com/images/electronics/starlink), CC BY-NC 4.0).
- Secrets stay server-side; the browser only talks to OrbitDesk API routes.
- If HA is configured but unreachable (or no Starlink entities exist), the UI falls back to demo dishes and surfaces the connection message.
