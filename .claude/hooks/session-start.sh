#!/bin/bash
# Cloud-Sitzungen von Claude Code: Abhängigkeiten für npm test installieren (Electron wird dafür nicht gebraucht).
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR"
if [ ! -d node_modules/@playwright/test ]; then
  # npm ci ändert package-lock.json nicht; Chromium für Playwright ist in der Cloud vorinstalliert
  npm ci --ignore-scripts --no-audit --no-fund --loglevel=error
fi
