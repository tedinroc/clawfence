#!/usr/bin/env bash
# Pack the persistent demo runtime for a USB stick / second Mac.
#   ./scripts/pack-runtime.sh --check
#   ./scripts/pack-runtime.sh /Volumes/USB/clawfence-runtime.tar.gz
set -euo pipefail
RUNTIME="${CLAWFENCE_RUNTIME:-$HOME/clawfence-runtime}"
OUT="${1:-$HOME/clawfence-runtime.tar.gz}"

if [ "${1:-}" = "--check" ]; then
  for p in "$RUNTIME/node/bin/node" "$RUNTIME/ocapp/node_modules/.bin/openclaw"; do
    [ -e "$p" ] && echo "OK   $p" || { echo "MISS $p" >&2; exit 1; }
  done
  [ -x "$RUNTIME/mlxenv/bin/mlx_lm.server" ] && echo "OK   mlx-lm (optional)" || echo "WARN mlx-lm missing (scripted demo still works)"
  du -sh "$RUNTIME"
  exit 0
fi

[ -d "$RUNTIME" ] || { echo "missing runtime: $RUNTIME" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"
echo "packing $RUNTIME -> $OUT"
tar -czf "$OUT" \
  --exclude='*.pyc' --exclude='__pycache__' --exclude='*.log' \
  -C "$(dirname "$RUNTIME")" "$(basename "$RUNTIME")"
ls -lh "$OUT"
echo
echo "On the travel Mac:"
echo "  tar -xzf $(basename "$OUT") -C \"\$HOME\""
echo "  export PATH=\"\$HOME/clawfence-runtime/node/bin:\$PATH\""
echo "  cd /path/to/clawfence && ./scripts/preflight.sh"
