#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Cursor Sobriety Check needs Node.js."
  echo "Install the LTS version from https://nodejs.org and run this again."
  exit 1
fi

echo "Installing Cursor Sobriety Check..."
node cli.mjs install
