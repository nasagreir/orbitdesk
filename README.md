# OrbitDesk

Starlink operations dashboard with Home Assistant telemetry and a Grok (xAI) assistant.

## Features

- Fleet overview for one or more Starlink dishes (throughput, latency, obstruction, uptime)
- Device actions: reboot / stow / unstow via Home Assistant button entities
- Grok ops chat grounded in the current dish snapshot
- Demo mode when credentials are missing so you can explore the UI immediately

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev -- --port 3456
```

Open [http://localhost:3456](http://localhost:3456).

## Connect Home Assistant

1. Install the **Starlink** integration in Home Assistant so dish sensors appear (`sensor.starlink_*`).
2. Create a long-lived access token in your HA profile.
3. Set in `.env.local`:

```env
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=your-token
```

OrbitDesk reads `/api/states`, groups Starlink entities, and maps downlink/uplink/ping/obstruction/uptime. Actions call `button.press` on matching reboot/stow/unstow entities.

## Connect Grok

Set an xAI API key:

```env
GROK_API_KEY=xai-...
```

`XAI_API_KEY` is accepted as an alias. Optional: `GROK_MODEL`, `GROK_BASE_URL`.

Without a key, the assistant returns demo replies based on the current fleet snapshot.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev -- --port 3456` | Dev server |
| `npm run build` | Production build |
| `npm run start -- --port 3456` | Serve production build |
| `npm run lint` | ESLint |

## Notes

- Secrets stay server-side; the browser only talks to OrbitDesk API routes.
- If HA is configured but unreachable (or no Starlink entities exist), the UI falls back to demo dishes and surfaces the connection message.
