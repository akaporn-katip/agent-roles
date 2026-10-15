#!/usr/bin/env bash
# ติดตั้ง Pi extension ฝั่งบังคับใช้ลงโฟลเดอร์ extensions ส่วนตัวของ Pi
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)/pi-extension/paseo-roles.js"
DEST_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions"
mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST_DIR/paseo-roles.js"
echo "installed $DEST_DIR/paseo-roles.js"
echo "Pi loads it on the next session; running agents keep their old rules until restarted."
