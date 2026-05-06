"""
Gunicorn-Defaults für Produktion (z. B. Render.com).

Das Standard-Worker-Timeout liegt bei nur 30s — Smartboard-Pipelines können mehrere
Gemini-Aufrufe à bis zu GEMINI_TIMEOUT_SECONDS (standardmäßig 600s) und Validierung kombinieren.
Zusätzlich: Bei SIGTERM (z. B. Render-Deploy) erlaubt ``graceful_timeout`` dem Worker Zeit,
die laufende Anfrage noch zu Ende zu bedienen — sonst bricht eine lange Generation trotz
hohem ``timeout`` nach wenigen Sekunden/Minuten ab.

Start (Arbeitsverzeichnis backend/):
    gunicorn --config gunicorn.conf.py config.wsgi:application
"""
from __future__ import annotations

import multiprocessing
import os


def _int_env(key: str, default: int, *, minimum: int = 1) -> int:
    raw = os.environ.get(key)
    if raw is None or not str(raw).strip():
        return max(minimum, default)
    try:
        return max(minimum, int(str(raw).strip(), 10))
    except ValueError:
        return max(minimum, default)


def _resolved_workers() -> int:
    for key in ('WEB_CONCURRENCY', 'GUNICORN_WORKERS'):
        raw = os.environ.get(key)
        if raw is None or not str(raw).strip():
            continue
        try:
            return max(1, int(str(raw).strip(), 10))
        except ValueError:
            continue
    cores = max(1, multiprocessing.cpu_count() or 1)
    return min(cores, 4)


port = os.environ.get('PORT', '8000')
bind = os.environ.get('GUNICORN_BIND', f'0.0.0.0:{port}')
# Mindestens ~10 Minuten realistisches Budget; mehrstufige Pipelines können länger brauchen.
timeout = _int_env('GUNICORN_TIMEOUT', 1800, minimum=600)
# Bei Deploy muss dieser Wert ebenfalls zur längsten Anfrage passen — sonst SIGKILL während Gemini.
graceful_timeout = _int_env('GUNICORN_GRACEFUL_TIMEOUT', 1800, minimum=600)
workers = _resolved_workers()
