"""Backwards-compat-Wrapper.

Die eigentliche Logik lebt jetzt in :class:`WorksheetGenerator` aus
``apps/worksheets/services/pipeline.py``. Externe Aufrufer dürfen weiter
``generate_worksheet(user, payload)`` benutzen.
"""
from __future__ import annotations

from .pipeline import WorksheetGenerator

__all__ = ['generate_worksheet', 'WorksheetGenerator']


def generate_worksheet(user, payload):
    return WorksheetGenerator(user, payload).run()
