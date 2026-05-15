# OpenFX Web

This app is the Deno-native web surface for OpenFX.

## Commands

```bash
deno task --config apps/web/deno.json dev
deno task --config apps/web/deno.json build
deno task --config apps/web/deno.json preview
```

## Deployment target

The intended deployment target is Deno Deploy.

## Server-side features now hosted in `apps/web`

- DownIP update endpoint: `POST /update`
- DownIP mapping query endpoint: `GET /update`
- DownIP redirect endpoint: `GET /:key/*`
- Optional proxy endpoint: `GET|POST|PUT|PATCH|DELETE /api/proxy/*`

### Environment variables

- `DOWNIP_REDIRECT_SCHEME` — redirect scheme, default `http`
- `DOWNIP_REDIRECT_PORT` — optional global redirect port override
- `OPENFX_PROXY_UPSTREAM` — enables the optional proxy route when set
