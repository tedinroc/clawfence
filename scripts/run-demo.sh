#!/usr/bin/env bash
# Start the scripted model, the isolated demo gateway, and the arbiter.
# Run in a terminal; Ctrl-C stops all three.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_HOME="${CF_DEMO_HOME:-/tmp/cfhome}"
export HOME="$DEMO_HOME"
export OPENCLAW_STATE_DIR="$DEMO_HOME/.ocdemo"
export OPENCLAW_CONFIG_PATH="$DEMO_HOME/.ocdemo/openclaw.json"
QUEUE="${CF_QUEUE_DIR:-/tmp/clawfence-demo}"
OC="${OPENCLAW_BIN:-openclaw}"

if ! command -v "$OC" >/dev/null 2>&1; then
  echo "openclaw not found. Install it, or set OPENCLAW_BIN=/path/to/openclaw" >&2
  exit 1
fi
if [ ! -f "$OPENCLAW_CONFIG_PATH" ]; then
  "$ROOT/scripts/setup-demo.sh"
fi
# Live demo default: pause the call and resume it on approval.
CF_ESCALATION="${CF_ESCALATION:-pause}"
python3 - "$CF_ESCALATION" <<'PY'
import json, os, sys
p = os.environ["OPENCLAW_CONFIG_PATH"]
d = json.load(open(p))
entry = d["plugins"]["entries"]["clawfence"]
entry["config"]["escalation"] = sys.argv[1]
entry.setdefault("hooks", {})["timeoutMs"] = 600000
entry["hooks"].setdefault("timeouts", {})["before_tool_call"] = 600000
json.dump(d, open(p, "w"), indent=2)
PY

cleanup() { kill ${MODEL_PID:-0} ${GW_PID:-0} ${ARB_PID:-0} 2>/dev/null || true; }
trap cleanup EXIT INT TERM

node "$ROOT/scripts/scripted-demo-agent.mjs" --port 18084 &
MODEL_PID=$!
sleep 1

$OC gateway --allow-unconfigured > /tmp/clawfence-demo-gateway.log 2>&1 &
GW_PID=$!
echo "waiting for gateway..."
for i in $(seq 1 30); do
  if curl -sf -m 1 http://127.0.0.1:19002/ >/dev/null 2>&1; then break; fi
  sleep 1
done

OC_BIN="$(command -v "$OC")"
node "$ROOT/arbiter/server.mjs" --dir "$QUEUE" --host 0.0.0.0 --port 8791 --openclaw-bin "$OC_BIN" &
ARB_PID=$!
sleep 1
echo ""
echo "  Gateway:  http://127.0.0.1:19002/"
echo "  Arbiter:  http://127.0.0.1:8791/   (phone: use the Mac's LAN IP)"
echo ""
echo "Run the baseline and fence capture in another terminal:"
echo "  $ROOT/scripts/capture-demo.sh"
echo ""
echo "Ctrl-C stops the gateway, model, and arbiter."
wait
