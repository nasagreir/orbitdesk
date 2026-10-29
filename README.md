# OrbitDesk

Starlink operations dashboard with Home Assistant telemetry and a Grok (xAI) assistant.

## Features

- Fleet overview for one or more Starlink dishes (throughput, latency, obstruction, uptime)
- Device actions: reboot / stow / unstow via Home Assistant button entities
- Grok ops chat grounded in the current dish snapshot
- Demo mode when credentials are missing so you can explore the UI immediately
- Single pasteable Proxmox LXC installer

## Install on Proxmox (paste this)

On the **Proxmox host** as root — one script, one paste:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/orbitdesk/main/proxmox-install.sh)"
```

Repo: [github.com/nasagreir/orbitdesk](https://github.com/nasagreir/orbitdesk). Or paste the entire [`proxmox-install.sh`](proxmox-install.sh) file into the host shell.

Creates a Debian 12 LXC, builds OrbitDesk, enables `orbitdesk.service` on port **3456**.

## Quick start (local)

```bash
npm install
cp .env.example .env.local
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

`XAI_API_KEY` is accepted as an alias. Optional: `GROK_MODEL`, `GROK_BASE_URL`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev -- --port 3456` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve on `0.0.0.0:3456` |
| `bash proxmox-install.sh` | Pasteable Proxmox LXC installer |

## Notes

- Secrets stay server-side; the browser only talks to OrbitDesk API routes.
- If HA is configured but unreachable (or no Starlink entities exist), the UI falls back to demo dishes and surfaces the connection message.
