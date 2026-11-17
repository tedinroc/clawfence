#!/usr/bin/env bash
# Flash the ClawFence arbiter to an M5Stack board.
#   ./firmware/flash.sh cores3 /dev/cu.usbmodem1234
#   ./firmware/flash.sh cardputer /dev/cu.usbmodem1234
# Requires arduino-cli + ESP32 core 3.3.x + M5Unified/M5Cardputer + ArduinoJson.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOARD="${1:-}"
PORT="${2:-}"
AC="${ARDUINO_CLI:-arduino-cli}"
CFG="${ARDUINO_CONFIG:-}"

case "$BOARD" in
  cores3)    SKETCH="$ROOT/firmware/arduino/clawfence_arbiter";            FQBN="esp32:esp32:m5stack_cores3" ;;
  cardputer) SKETCH="$ROOT/firmware/arduino/clawfence_arbiter_cardputer";   FQBN="esp32:esp32:m5stack_cardputer" ;;
  *) echo "usage: $0 cores3|cardputer /dev/cu.usbmodemXXXX" >&2; exit 2 ;;
esac

if ! command -v "$AC" >/dev/null 2>&1; then
  echo "arduino-cli not found. Install it, or set ARDUINO_CLI=/path/to/arduino-cli" >&2
  exit 1
fi

CONFIG_ARGS=()
[ -n "$CFG" ] && CONFIG_ARGS=(--config-file "$CFG")

echo "compiling $SKETCH for $FQBN..."
"$AC" "${CONFIG_ARGS[@]}" compile --fqbn "$FQBN" --output-dir "$SKETCH/build" "$SKETCH"

if [ -z "$PORT" ]; then
  echo "compiled. Pass a serial port to upload (e.g. /dev/cu.usbmodemXXXX)."
  exit 0
fi

echo "uploading to $PORT..."
"$AC" "${CONFIG_ARGS[@]}" upload -p "$PORT" --fqbn "$FQBN" "$SKETCH"
echo "done. Open the serial monitor at 115200 baud."
