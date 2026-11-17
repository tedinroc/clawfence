#!/usr/bin/env bash
# Generate a QR code for the phone arbiter URL.
#   ./scripts/show-qr.sh                 # uses en0 LAN IP + ?simple=1
#   ./scripts/show-qr.sh http://x:8791/?simple=1
#   ./scripts/show-qr.sh --open          # also open in Preview
set -euo pipefail
RUNTIME="${CLAWFENCE_RUNTIME:-$HOME/clawfence-runtime}"
PY="$RUNTIME/mlxenv/bin/python"
OUT="${CLAWFENCE_QR_OUT:-/tmp/clawfence-qr.png}"

OPEN=0
if [ "${1:-}" = "--open" ]; then OPEN=1; shift; fi
URL="${1:-}"
if [ -z "$URL" ]; then
  IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  [ -n "$IP" ] || { echo "no LAN IP; pass a URL" >&2; exit 1; }
  URL="http://$IP:8791/?simple=1"
fi

if [ ! -x "$PY" ] || ! "$PY" -c "import segno" >/dev/null 2>&1; then
  echo "segno not installed. Run: uv pip install --python $PY segno" >&2
  exit 1
fi

"$PY" - "$URL" "$OUT" <<'PY'
import segno, sys
url, out = sys.argv[1], sys.argv[2]
q = segno.make(url, error="m")
q.save(out, scale=12, border=3, dark="#0b0b0e", light="white")
print(out)
PY
echo "URL: $URL"
echo "QR:  $OUT"
if [ "$OPEN" = "1" ]; then open "$OUT"; fi
