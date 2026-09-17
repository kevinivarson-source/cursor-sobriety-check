#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Install Node.js from https://nodejs.org"; exit 1; }
node cli.mjs report --open
