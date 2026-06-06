# freemac Bun MVP architecture

## Runtime shape

- Single Bun service process for API, DDNS jobs, telemetry jobs, auth, agent
  planning, and static asset hosting
- React + Vite+ dashboard built to static files and served by the core service
  in production
- File-backed local persistence using JSON and NDJSON
- Caddy in front for HTTPS and reverse proxy

## Core modules

- `config`: runtime configuration and filesystem paths
- `db`: file-backed persistence helpers for settings, sessions, telemetry, and
  audit logs
- `services/ddns`: IPv6 detection and verification
- `services/telemetry`: periodic macOS snapshot collection
- `services/agent`: prompt to tool-plan mapping
- `services/executor`: strict tool execution boundary
- `routes/*`: auth, system, agent, and event APIs

## Security direction

- Single-user password login for MVP
- No free-form shell execution
- Audit every tool execution request
- Approval required for state-changing tools
- Prefer Keychain for long-lived secrets
