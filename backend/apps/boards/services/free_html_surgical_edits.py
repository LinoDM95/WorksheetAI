"""Chirurgische Board-Revision: Search-Replace auf HTML/CSS/JS ohne komplette Neu-Ausgabe."""
from __future__ import annotations

from typing import Any


class SurgicalRevisionError(ValueError):
    """Mindestens eine ``old_text``-Sequenz passt nicht eindeutig ins Ziel-File."""

    def __init__(self, messages: list[str]) -> None:
        self.messages = messages
        super().__init__(
            'Chirurgische Revision: ' + ('; '.join(messages) if messages else 'unbekannter Fehler')
        )


def _pick_target_string(
    target: str,
    *,
    html: str,
    css: str,
    javascript: str,
) -> tuple[str | None, str]:
    t = (target or '').strip().lower()
    if t == 'html':
        return html, 'html'
    if t == 'css':
        return css, 'css'
    if t in ('javascript', 'js'):
        return javascript, 'javascript'
    return None, ''


def apply_surgical_edits(
    *,
    html: str,
    css: str,
    javascript: str,
    edits: list[dict[str, Any]],
) -> tuple[str, str, str, list[str]]:
    """Wendet Ersetzungen nacheinander an ``old_text`` muss **genau einmal** vorkommen."""
    errors: list[str] = []
    h, c, j = html, css, javascript
    for idx, ed in enumerate(edits or []):
        if not isinstance(ed, dict):
            errors.append(f'Edit {idx}: kein Objekt')
            continue
        tgt_raw = ed.get('target')
        old_t = ed.get('old_text')
        new_t = ed.get('new_text') if 'new_text' in ed else ''
        if old_t is None:
            errors.append(f'Edit {idx}: old_text fehlt')
            continue
        if not isinstance(old_t, str):
            old_t = str(old_t)
        if not isinstance(new_t, str):
            new_t = str(new_t)
        blob, label = _pick_target_string(str(tgt_raw or ''), html=h, css=c, javascript=j)
        if blob is None:
            errors.append(f'Edit {idx}: ungültiges target „{tgt_raw}“ (nur html, css, javascript)')
            continue
        n = blob.count(old_t)
        if n == 0:
            errors.append(f'Edit {idx} ({label}): old_text nicht gefunden')
            continue
        if n > 1:
            errors.append(f'Edit {idx} ({label}): old_text kommt {n}× vor — muss eindeutig sein')
            continue
        if label == 'html':
            h = h.replace(old_t, new_t, 1)
        elif label == 'css':
            c = c.replace(old_t, new_t, 1)
        else:
            j = j.replace(old_t, new_t, 1)
    return h, c, j, errors


def expand_surgical_revision_raw(
    raw: dict[str, Any] | None,
    *,
    base_html: str,
    base_css: str,
    base_javascript: str,
) -> dict[str, Any]:
    """Wenn ``revision_kind`` = ``surgical`` und ``surgical_edits`` gesetzt: Patches anwenden.

    Gibt ein neues Dict zurück (Kopie), in dem ``html``/``css``/``javascript`` den Ergebnis-Code
    enthalten. Bei Fehler: :class:`SurgicalRevisionError`.
    """
    if not isinstance(raw, dict):
        return {}
    out = dict(raw)
    kind = str(out.get('revision_kind') or 'full').strip().lower()
    if kind != 'surgical':
        return out
    edits = out.get('surgical_edits')
    if not isinstance(edits, list) or len(edits) == 0:
        for key, base in (
            ('html', base_html),
            ('css', base_css),
            ('javascript', base_javascript),
        ):
            val = out.get(key)
            if val is None or (isinstance(val, str) and val == ''):
                out[key] = base
        return out
    h, c, j, errs = apply_surgical_edits(
        html=base_html,
        css=base_css,
        javascript=base_javascript,
        edits=edits,
    )
    if errs:
        raise SurgicalRevisionError(errs)
    out['html'] = h
    out['css'] = c
    out['javascript'] = j
    return out


def normalize_provider_free_html_response(
    raw: dict[str, Any] | None,
    *,
    base_html: str,
    base_css: str,
    base_javascript: str,
) -> dict[str, Any]:
    """Wendet chirurgische Edits auf Basis-Code an; bei Fehler :class:`ValueError` (API-tauglich)."""
    try:
        return expand_surgical_revision_raw(
            raw if isinstance(raw, dict) else {},
            base_html=base_html,
            base_css=base_css,
            base_javascript=base_javascript,
        )
    except SurgicalRevisionError as exc:
        raise ValueError(
            'Die gezielte Änderung konnte nicht angewendet werden (old_text nicht eindeutig): '
            + '; '.join(exc.messages)
        ) from exc
