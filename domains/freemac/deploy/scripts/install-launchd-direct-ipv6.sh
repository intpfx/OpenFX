#!/bin/zsh
set -euo pipefail

ROOT_DIR="${1:-$PWD}"
BUN_BIN="${BUN_BIN:-$(command -v bun)}"
HOME_DIR="$HOME"
LAUNCH_AGENTS_DIR="$HOME_DIR/Library/LaunchAgents"
ENV_EXAMPLE="$ROOT_DIR/deploy/env/freemac.core.direct-ipv6.env.example"
ENV_FILE="$ROOT_DIR/deploy/env/freemac.core.env"
CORE_TEMPLATE="$ROOT_DIR/deploy/launchd/com.freemac.agent.plist"
CORE_TARGET="$LAUNCH_AGENTS_DIR/com.freemac.core.plist"

if [[ -z "$BUN_BIN" ]]; then
  echo "bun must be installed and discoverable in PATH" >&2
  exit 1
fi

mkdir -p "$LAUNCH_AGENTS_DIR"
mkdir -p "$ROOT_DIR/.data/direct-ipv6"
chmod +x "$ROOT_DIR/deploy/scripts/start-core.sh"

if [[ ! -f "$ENV_FILE" ]]; then
  sed \
    -e "s|__FREEMAC_ROOT__|$ROOT_DIR|g" \
    "$ENV_EXAMPLE" > "$ENV_FILE"
fi

sed \
  -e "s|__FREEMAC_ROOT__|$ROOT_DIR|g" \
  -e "s|__HOME__|$HOME_DIR|g" \
  -e "s|__BUN_BIN__|$BUN_BIN|g" \
  "$CORE_TEMPLATE" > "$CORE_TARGET"

launchctl unload "$CORE_TARGET" 2>/dev/null || true
launchctl load "$CORE_TARGET"

echo "Installed launchd agent:"
echo "  $CORE_TARGET"
echo "Using environment file: $ENV_FILE"
echo "Remember to allow inbound TCP/24531 on your router and macOS firewall."
