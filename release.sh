#!/bin/sh
# Render.com: als "Release Command" setzen (vor jedem Deploy),
# z. B.: bash release.sh   oder   sh release.sh
set -eu
cd "$(dirname "$0")/backend"
exec python manage.py migrate --noinput
