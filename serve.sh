#!/usr/bin/env bash

# Simple helper to serve the static site on port 8000.
set -euo pipefail

python3 -m http.server 8000
