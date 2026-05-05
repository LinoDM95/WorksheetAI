"""Hilfsfunktionen für Bausteine: HTML-Escaping, IDs, Touch-konforme Buttons."""
from __future__ import annotations

import json
import re
from html import escape as _html_escape
from typing import Any


_ID_SLUG_RE = re.compile(r'[^a-z0-9]+')


def slug(text: str) -> str:
    s = _ID_SLUG_RE.sub('-', (text or '').lower()).strip('-')
    return s or 'x'


def block_id(prefix: str, instance_id: str) -> str:
    """Stable DOM id pro Bausteininstanz, sicher als CSS/JS Selector."""
    return f'b-{prefix}-{slug(instance_id)}'


def esc(text: Any) -> str:
    """HTML-escapen, immer als String."""
    return _html_escape('' if text is None else str(text), quote=True)


def js_str(value: Any) -> str:
    """Sichere JSON-Repräsentation für Inline-JS — entschärft </script>."""
    return json.dumps(value, ensure_ascii=False).replace('</', '<\\/')
