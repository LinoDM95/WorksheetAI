"""KI-Feinschliff für den Bausteinmodus.

Sicherheitsbudget: dieser Pfad darf **niemals** Code generieren. Code-Schlüssel
werden vor der Übernahme verworfen, Themen werden auf die erlaubte Liste
limitiert, Texte werden gekürzt und nicht erlaubte HTML-Tags entfernt.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from apps.ai.providers.factory import get_provider

from .blocks.themes import THEME_BY_ID, DEFAULT_THEME_ID

logger = logging.getLogger(__name__)


_FORBIDDEN_KEYS = {'html', 'css', 'javascript', 'js', 'script', 'style'}
_HTML_TAG_RE = re.compile(r'<[^>]+>')
_MAX_NOTES = 600
_MAX_INSTRUCTION_ITEMS = 6
_MAX_INSTRUCTION_LEN = 200
_MAX_TRANSITION_LEN = 40


def _clean_text(text: Any, *, limit: int) -> str:
    if text is None:
        return ''
    s = _HTML_TAG_RE.sub(' ', str(text)).strip()
    return s[:limit]


def _validate_finishing_payload(raw: Any, default_theme_id: str) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {'theme_id': default_theme_id, 'source': 'fallback'}
    for key in list(raw.keys()):
        if key.lower() in _FORBIDDEN_KEYS:
            del raw[key]

    theme_id = (str(raw.get('theme_id') or '').strip().lower() or default_theme_id)
    if theme_id not in THEME_BY_ID:
        theme_id = default_theme_id if default_theme_id in THEME_BY_ID else DEFAULT_THEME_ID

    transitions: dict[str, str] = {}
    raw_trans = raw.get('transitions')
    if isinstance(raw_trans, dict):
        for k, v in list(raw_trans.items())[:12]:
            try:
                key_int = int(k)
            except (TypeError, ValueError):
                continue
            transitions[str(key_int)] = _clean_text(v, limit=_MAX_TRANSITION_LEN)

    teacher_notes = _clean_text(raw.get('teacher_notes'), limit=_MAX_NOTES)

    usage: list[str] = []
    raw_usage = raw.get('usage_instructions')
    if isinstance(raw_usage, list):
        for item in raw_usage[:_MAX_INSTRUCTION_ITEMS]:
            usage.append(_clean_text(item, limit=_MAX_INSTRUCTION_LEN))
        usage = [u for u in usage if u]

    return {
        'theme_id': theme_id,
        'transitions': transitions,
        'teacher_notes': teacher_notes,
        'usage_instructions': usage,
        'source': 'ai',
    }


def _spec_compact(spec) -> dict[str, Any]:
    return {
        'subject': spec.subject,
        'grade': spec.grade,
        'topic': spec.topic,
        'title': spec.title,
        'pages': [
            {
                'index': i,
                'title': p.title,
                'block_ids': [b.block_id for b in p.blocks],
            }
            for i, p in enumerate(spec.pages)
        ],
    }


def run_finishing(spec) -> dict[str, Any]:
    """Ruft optional einen Provider auf; bei Fehler oder fehlender Methode → Fallback."""
    provider = get_provider()
    method = getattr(provider, 'generate_blocks_finishing', None)
    default_theme = (spec.theme_id or '').strip().lower() or DEFAULT_THEME_ID
    if method is None:
        return {'theme_id': default_theme if default_theme in THEME_BY_ID else DEFAULT_THEME_ID, 'source': 'no-provider'}
    try:
        raw = method({'spec': _spec_compact(spec)})
    except Exception:
        logger.exception('Bausteinmodus-Feinschliff: Provider-Fehler — Fallback ohne KI.')
        return {'theme_id': default_theme if default_theme in THEME_BY_ID else DEFAULT_THEME_ID, 'source': 'error'}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning('Bausteinmodus-Feinschliff: Provider lieferte ungültiges JSON.')
            raw = {}
    return _validate_finishing_payload(raw, default_theme)
