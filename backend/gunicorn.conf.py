"""
Gunicorn-Defaults für Produktion (z. B. Render.com).

Das Standard-Worker-Timeout liegt bei nur 30s — kreative Smartboard-Pipelines warten jedoch
bis zu GEMINI_TIMEOUT_SECONDS (standardmäßig 600s) auf die Provider-Antwort, daher ohne
Angleichung WORKER TIMEOUT + abgebrochene Streams.

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
timeout = _int_env('GUNICORN_TIMEOUT', 900, minimum=60)
graceful_timeout = _int_env('GUNICORN_GRACEFUL_TIMEOUT', 120, minimum=10)
workers = _resolved_workers()
