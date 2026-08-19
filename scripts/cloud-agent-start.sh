#!/usr/bin/env bash
set -euo pipefail

if [ ! -d /.alchemy ]; then
  sudo mkdir -p /.alchemy
  sudo chown "$(id -u):$(id -g)" /.alchemy
fi
