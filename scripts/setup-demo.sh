#!/usr/bin/env bash
# Create an isolated demo home + gateway config. Never touches the real home.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_HOME="${CF_DEMO_HOME:-/tmp/cfhome}"
DEMO_STATE="$DEMO_HOME/.ocdemo"
QUEUE="${CF_QUEUE_DIR:-/tmp/clawfence-demo}"

rm -rf "$DEMO_HOME"
mkdir -p "$DEMO_HOME/Downloads/Photos" "$DEMO_HOME/Documents" "$DEMO_HOME/.ssh" "$DEMO_HOME/workspace" "$DEMO_STATE"
printf 'project ideas: build a fence for agents\n' > "$DEMO_HOME/Downloads/notes.md"
printf 'PNG' > "$DEMO_HOME/Downloads/a.png"
printf 'PDF' > "$DEMO_HOME/Downloads/receipt.pdf"
printf 'index' > "$DEMO_HOME/Documents/archive-index.md"
printf 'FAKE-SSH-KEY-DEMO\n' > "$DEMO_HOME/.ssh/id_rsa"
rm -rf "$QUEUE"; mkdir -p "$QUEUE"

python3 - "$ROOT" "$DEMO_HOME" "$DEMO_STATE" "$QUEUE" <<'PY'
import json, os, sys
root, home, state, queue = sys.argv[1:5]
config = {
  "gateway": {
    "mode": "local",
    "auth": {"mode": "token", "token": "clawfence-demo"},
    "port": 19002,
    "bind": "loopback",
    "tailscale": {"mode": "off"},
    "tools": {"allow": ["exec", "apply_patch", "write", "read"]}
  },
  "agents": {
    "defaults": {
      "workspace": os.path.join(home, "workspace"),
      "models": {"clawfence-demo/model": {}},
      "model": {"primary": "clawfence-demo/model"}
    },
    "entries": {
      "main": {
        "name": "main",
        "workspace": os.path.join(home, "workspace"),
        "agentDir": os.path.join(state, "agents/main/agent"),
        "identity": {"name": "main"}
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "clawfence-demo": {
        "baseUrl": "http://127.0.0.1:18084/v1",
        "api": "openai-completions",
        "apiKey": "demo",
        "models": [{
          "id": "model",
          "name": "ClawFence scripted demo model",
          "contextWindow": 128000,
          "maxTokens": 8192,
          "input": ["text"],
          "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
          "reasoning": False,
          "compat": {"supportsTools": True}
        }]
      }
    }
  },
  "plugins": {
    "entries": {
      "clawfence": {
        "enabled": True,
        "hooks": {"allowConversationAccess": True, "timeoutMs": 600000, "timeouts": {"before_tool_call": 600000}},
        "config": {"mode": "observe", "escalation": "queue", "queueDir": queue, "semantic": False, "approvalTtlMs": 300000}
      }
    },
    "load": {"paths": [root]}
  },
  "tools": {"profile": "full"}
}
with open(os.path.join(state, "openclaw.json"), "w") as f:
    json.dump(config, f, indent=2)
print("wrote", os.path.join(state, "openclaw.json"))
PY
echo "demo home: $DEMO_HOME"
echo "queue: $QUEUE"
