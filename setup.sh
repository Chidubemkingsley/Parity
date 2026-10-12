#!/usr/bin/env bash
# One-time setup: installs OpenZeppelin (npm), forge-std (git), and script deps.
set -euo pipefail
cd "$(dirname "$0")/contracts"
npm install --silent
[ -d lib/forge-std ] || git clone --depth 1 --branch v1.9.4 https://github.com/foundry-rs/forge-std lib/forge-std
cd ../scripts && npm install --silent
echo "done. Next: cd contracts && forge test"
