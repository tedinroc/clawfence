#!/usr/bin/env bash
# Cheap on-site preflight. Does not start servers.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="${CLAWFENCE_RUNTIME:-$HOME/clawfence-runtime}"
NODE_BIN=""
OC_BIN=""
warn=0
fail=0

ok() { printf "  OK   %s\n" "$1"; }
w()  { printf "  WARN %s\n" "$1"; warn=$((warn+1)); }
no() { printf "  FAIL %s\n" "$1"; fail=$((fail+1)); }

echo "ClawFence preflight"
echo "root: $ROOT"
echo "runtime: $RUNTIME"

if [ -x "$RUNTIME/node/bin/node" ]; then NODE_BIN="$RUNTIME/node/bin/node"; else NODE_BIN="$(command -v node || true)"; fi
if [ -x "$RUNTIME/ocapp/node_modules/.bin/openclaw" ]; then OC_BIN="$RUNTIME/ocapp/node_modules/.bin/openclaw"; else OC_BIN="$(command -v openclaw || true)"; fi

[ -n "$NODE_BIN" ] && ok "node: $($NODE_BIN -v)" || no "node not found"
if [ -n "$OC_BIN" ]; then
  v="$(PATH="$(dirname "$NODE_BIN"):$PATH" "$OC_BIN" --version 2>/dev/null | head -1)"
  case "$v" in *2026.11*) ok "openclaw: $v" ;; *) w "openclaw version unexpected: $v" ;; esac
else no "openclaw not found (set OPENCLAW_BIN)"; fi

for f in index.js lib/intent.js lib/action.js lib/decide.js arbiter/server.mjs openclaw.plugin.json; do
  [ -f "$ROOT/$f" ] && ok "file: $f" || no "missing: $f"
done

python3 - "$ROOT/openclaw.plugin.json" <<'PY' && ok "plugin manifest parses" || no "plugin manifest invalid"
import json,sys
json.load(open(sys.argv[1]))
PY

DEMO_HOME="${CF_DEMO_HOME:-/tmp/cfhome}"
DEMO_CONFIG="$DEMO_HOME/.ocdemo/openclaw.json"
[ -f "$DEMO_CONFIG" ] && ok "demo config: $DEMO_CONFIG" || w "demo config missing (run scripts/setup-demo.sh)"

MODEL="$HOME/.lmstudio/models/lmstudio-community/Qwen3-4B-MLX-4bit"
[ -d "$MODEL" ] && ok "Qwen3-4B model present" || w "Qwen3 model missing (scripted demo still works)"
[ -x "$RUNTIME/mlxenv/bin/mlx_lm.server" ] && ok "mlx_lm.server present" || w "mlx-lm venv missing (real-model demo disabled)"

for b in firmware/bin/clawfence_arbiter_cores3.bin firmware/bin/clawfence_arbiter_cardputer.bin; do
  [ -f "$ROOT/$b" ] && ok "firmware: $b" || w "missing firmware: $b"
done
[ -f "$ROOT/demo/clawfence-demo.mp4" ] && ok "video fallback present" || w "video fallback missing"
[ -f "$ROOT/demo/clawfence-deck.pdf" ] && ok "deck PDF present" || w "deck PDF missing"

for p in 19002 8791; do
  if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then w "port $p already in use"; else ok "port $p free"; fi
done

echo
if [ "$fail" -gt 0 ]; then
  echo "RESULT: FAIL ($fail failures, $warn warnings)"
  exit 1
fi
echo "RESULT: PASS ($warn warnings)"
