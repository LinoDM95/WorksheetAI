#!/bin/sh
# Render / Produktion: Start mit Schema-Migration (falls kein eigener Release-Step läuft).
# Im Dashboard als Start Command z. B.: cd backend && sh start_render.sh
set -eu
cd "$(dirname "$0")"
python manage.py migrate --noinput
exec gunicorn --config gunicorn.conf.py config.wsgi:application
