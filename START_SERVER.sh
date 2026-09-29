#!/usr/bin/env bash
# Launch1500 Independent Website Launcher
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
exec bash "$DIR/start.sh" "$@"
