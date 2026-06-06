# freemac MVP setup

## Prerequisites

- Bun 1.2+
- macOS with a reachable IPv6 setup if you plan direct public access

## Local development

```bash
bun install
bun run dev
```

Core service defaults to `http://127.0.0.1:24531`. Web dev server defaults to
`http://127.0.0.1:5173`.

## First-run setup

On first launch, open the dashboard and complete the setup form.

- The local dashboard login password is hashed and stored in the file-backed
  state store.
- The direct public port is fixed at `24531`.

If you want to skip domains and HTTPS entirely, use
[docs/deploy-direct-ipv6-high-port.md](deploy-direct-ipv6-high-port.md).

## Environment variables

- `FREEMAC_HOST`
- `FREEMAC_PASSWORD`
- `FREEMAC_DATA_DIR`
- `FREEMAC_WEB_DIST`
- `FREEMAC_DDNS_INTERVAL_MS`
- `FREEMAC_TELEMETRY_INTERVAL_MS`
- `FREEMAC_DDNS_OBSERVATION_URLS`

## Next implementation targets

1. Add auth guard middleware to protect non-public routes.
2. Persist approvals and render them in the dashboard.
3. Add richer interface and network breakdowns to telemetry history.
4. Improve direct IPv6 connectivity diagnostics in the dashboard.

## launchd notes

- Use absolute paths for Bun and all invoked system commands.
- Prefer running the compiled or fixed-path service instead of ad hoc shell
  wrappers.
- Keep logs under `~/Library/Logs` or a dedicated app support directory.
