#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_FREEMAC_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FREEMAC_ROOT="${FREEMAC_ROOT:-$DEFAULT_FREEMAC_ROOT}"
FREEMAC_ENV_FILE="${FREEMAC_ENV_FILE:-$FREEMAC_ROOT/deploy/env/freemac.core.env}"
BUN_BIN="${BUN_BIN:-$(command -v bun)}"

: "${BUN_BIN:?BUN_BIN is required}"

if [[ -f "$FREEMAC_ENV_FILE" ]]; then
  set -a
  source "$FREEMAC_ENV_FILE"
  set +a
fi

mkdir -p "${FREEMAC_DATA_DIR:-$FREEMAC_ROOT/.data/direct-ipv6}"
cd "$FREEMAC_ROOT"

exec "$BUN_BIN" apps/core/src/index.ts
