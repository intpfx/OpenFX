# freemac direct public IPv6 with a high port

This path removes the domain and HTTPS reverse-proxy requirement entirely.

## When to use this

Use this mode if:

- you only need personal remote access
- you are fine accessing freemac by raw IPv6 address and port
- you want to avoid 80/443 conflicts, certificate issuance, and domain setup

This mode is simpler than Caddy plus domain deployment, but it has tradeoffs:

- the URL is ugly: `http://[your-public-ipv6]:24531`
- some mobile environments still handle raw IPv6 URLs poorly
- there is no HTTPS termination in this mode

## Architecture

- freemac core listens directly on `::` and the fixed port `24531`
- clients connect directly to the Mac's public IPv6 and that port
- no Caddy, no domain, no certificate flow

## Prerequisites

- Bun installed at a stable path such as `/opt/homebrew/bin/bun`
- the Mac has a real public IPv6 address
- your router allows inbound TCP on `24531`
- macOS firewall allows inbound TCP on `24531`

## Build the app

```bash
bun install
bun run build
```

## Install the launchd service

```bash
chmod +x deploy/scripts/install-launchd-direct-ipv6.sh
./deploy/scripts/install-launchd-direct-ipv6.sh "$PWD"
```

This will:

- generate `deploy/env/freemac.core.env` from the direct IPv6 template if it
  does not exist
- generate `~/Library/LaunchAgents/com.freemac.core.plist`
- load the freemac core launchd agent

The public port is fixed at `24531`. Restart the `com.freemac.core` agent if you
update host or relay-related settings in the env file.

## Environment file

The direct IPv6 template is:

[deploy/env/freemac.core.direct-ipv6.env.example](../deploy/env/freemac.core.direct-ipv6.env.example)

Recommended values:

```env
FREEMAC_HOST=::
FREEMAC_WEB_DIST=/absolute/path/to/freemac/apps/web/dist
FREEMAC_DATA_DIR=/absolute/path/to/freemac/.data/direct-ipv6
FREEMAC_RELAY_ORIGIN=
```

You can edit `deploy/env/freemac.core.env` later and then restart the agent:

```bash
launchctl unload ~/Library/LaunchAgents/com.freemac.core.plist
launchctl load ~/Library/LaunchAgents/com.freemac.core.plist
```

If you also deploy the companion Deno Deploy relay app, fill in its origin in
the dashboard or set `FREEMAC_RELAY_ORIGIN` in the env file. freemac will then
automatically POST the latest IPv6 and active port on startup and at a fixed
interval.

## Find the current public IPv6

From the Mac:

```bash
curl -6 https://api64.ipify.org
```

If the result is `2409:xxxx:...`, your access URL is:

```text
http://[2409:xxxx:...]:24531
```

The square brackets are required for IPv6 URLs with ports.

## Verification

From the Mac:

```bash
curl http://127.0.0.1:24531/api/health
curl -g "http://[::1]:24531/api/health"
```

From another IPv6-capable device or network:

```bash
curl -g "http://[your-public-ipv6]:24531/api/health"
```

## Common failure points

1. The service is still bound to `127.0.0.1` instead of `::`.
2. The router blocks inbound TCP on the chosen high port.
3. The macOS firewall blocks the Bun process.
4. The client network has no usable IPv6 connectivity.
5. A carrier-grade or router security policy blocks unsolicited inbound IPv6.

## Logs

- `~/Library/Logs/freemac-core.log`
- `~/Library/Logs/freemac-core.error.log`

## Notes

- This mode is appropriate for personal use, not polished public distribution.
- If raw IPv6 URLs become too inconvenient, move to a tunnel or a VPS relay
  later.
