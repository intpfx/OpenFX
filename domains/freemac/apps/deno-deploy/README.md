# freemac Deno Deploy relay

This app is intended to be deployed on Deno Deploy.

## What it does

- accepts a POST request from the Mac with the latest public IPv6 and port
- persists the latest target in Deno KV
- serves a relay page and reverse-proxies the live freemac app through `/app`
- exposes a JSON status endpoint

## Endpoints

- `GET /` - HTML viewer page
- `GET /api/status` - current stored target
- `POST /api/report` - update the stored target

## Environment variables

- `FREEMAC_UPDATE_TOKEN` - optional bearer token required by `POST /api/report`

## Example report request

```bash
curl -X POST https://your-deno-app.deno.dev/api/report \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_TOKEN' \
  -d '{
    "ipv6": "2409:8a62:3210:3010:4845:d014:d517:117e",
    "port": 24531,
    "protocol": "http",
    "source": "freemac-home"
  }'
```

## Proxy behavior

The relay page uses `/app` and related proxied paths to embed the live freemac UI through the Deno
Deploy origin. This avoids the browser mixed-content block that would happen if an `https://` page
tried to iframe `http://[ipv6]:24531` directly.
