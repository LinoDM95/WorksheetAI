"""Validierung und Sanitizing für Free-HTML5-Tafelbilder.

Vollständige Sicherheit bietet die Kombination aus serverseitigem Filtering und
iframe-``sandbox`` im Frontend — dieses Modul reduziert offensichtliche Risiken
und gibt eine erweiterte Liste verbotener JS-Muster vor.
"""
from __future__ import annotations

import re
from typing import Any

MAX_HTML_LEN = 80_000
MAX_CSS_LEN = 120_000
MAX_JS_LEN = 120_000

_HTML_SCRIPT_RE = re.compile(r'<script\b[^>]*>[\s\S]*?</script>', re.IGNORECASE)
_HTML_SCRIPT_OPEN = re.compile(r'<\s*script\b', re.IGNORECASE)
_INLINE_EVENT_RE = re.compile(
    r'\s+on[a-z]+\s*=\s*([\'"])[\s\S]*?\1',
    re.IGNORECASE,
)
_IFRAME_EMBED_RE = re.compile(
    r'<\s*(iframe|object|embed|form)\b[^>]*>[\s\S]*?</\s*\1\s*>|<\s*(iframe|object|embed|form)\b[^>]*/?\s*>',
    re.IGNORECASE,
)
_META_REFRESH_RE = re.compile(r'<\s*meta\b[^>]*http-equiv\s*=\s*([\'"])refresh\1', re.IGNORECASE)
_JS_HREF_RE = re.compile(
    r'\b(href|src|srcset)\s*=\s*([\'"])\s*javascript:',
    re.IGNORECASE,
)

_DISALLOWED_HTML_ROOT = re.compile(
    r'<\s*(html|head|body|meta|link|base)\b',
    re.IGNORECASE,
)

_CSS_IMPORT_RE = re.compile(r'@import\b', re.IGNORECASE)
_CSS_URL_RE = re.compile(r'url\s*\(\s*([\'"]?)([^)\'"]+)\1\s*\)', re.IGNORECASE)
_CSS_POSITION_FIXED_RE = re.compile(r'position\s*:\s*fixed\b', re.IGNORECASE)

# Harte Verbote im JavaScript. Trifft beim Speichern als Validierungsfehler.
_FORBIDDEN_JS_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ('fetch(', re.compile(r'\bfetch\s*\(', re.IGNORECASE)),
    ('XMLHttpRequest', re.compile(r'\bXMLHttpRequest\b')),
    ('WebSocket', re.compile(r'\bWebSocket\b')),
    ('EventSource', re.compile(r'\bEventSource\b')),
    ('localStorage', re.compile(r'\blocalStorage\b')),
    ('sessionStorage', re.compile(r'\bsessionStorage\b')),
    ('indexedDB', re.compile(r'\bindexedDB\b')),
    ('document.cookie', re.compile(r'\bdocument\.cookie\b')),
    ('eval(', re.compile(r'\beval\s*\(')),
    ('new Function(', re.compile(r'\bnew\s+Function\s*\(')),
    ('Function( as constructor)', re.compile(r'\bFunction\s*\(\s*[\'"]')),
    ('import()', re.compile(r'\bimport\s*\(')),
    ('window.top', re.compile(r'\bwindow\.top\b')),
    ('window.parent', re.compile(r'\bwindow\.parent\b')),
    ('top.', re.compile(r'(?<![A-Za-z0-9_$])top\s*\.')),
    ('parent.', re.compile(r'(?<![A-Za-z0-9_$])parent\s*\.')),
    ('opener', re.compile(r'\bopener\b')),
    ('alert(', re.compile(r'\balert\s*\(')),
    ('confirm(', re.compile(r'\bconfirm\s*\(')),
    ('prompt(', re.compile(r'\bprompt\s*\(')),
    ('location.href', re.compile(r'\blocation\.href\b')),
    ('location.assign', re.compile(r'\blocation\.assign\b')),
    ('location.replace', re.compile(r'\blocation\.replace\b')),
    ('document.write', re.compile(r'\bdocument\.write\b')),
    ('navigator.sendBeacon', re.compile(r'\bnavigator\.sendBeacon\b')),
    ('serviceWorker', re.compile(r'\bserviceWorker\b')),
    ('Notification', re.compile(r'\bNotification\b')),
    ('navigator.geolocation', re.compile(r'\bnavigator\.geolocation\b')),
    ('navigator.clipboard', re.compile(r'\bnavigator\.clipboard\b')),
    ('PaymentRequest', re.compile(r'\bPaymentRequest\b')),
    ('Worker', re.compile(r'\bnew\s+Worker\b')),
    ('SharedWorker', re.compile(r'\bnew\s+SharedWorker\b')),
]

# Heuristische Warnungen — keine Validierungsfehler, nur Hinweise.
_WARN_JS_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ('setInterval ohne clearInterval', re.compile(r'\bsetInterval\s*\((?![\s\S]*?clearInterval)', re.IGNORECASE)),
    ('crypto.subtle', re.compile(r'\bcrypto\.subtle\b')),
]


def _clip(s: str, max_len: int) -> tuple[str, list[str]]:
    if len(s) <= max_len:
        return s, []
    return s[:max_len], [f'Text auf {max_len} Zeichen gekürzt.']


def sanitize_html_fragment(raw: str) -> tuple[str, list[str]]:
    out = raw or ''
    notes: list[str] = []
    if len(out) > MAX_HTML_LEN:
        out = out[:MAX_HTML_LEN]
        notes.append(f'HTML auf {MAX_HTML_LEN} Zeichen gekürzt.')
    if _HTML_SCRIPT_OPEN.search(out):
        out, n = _HTML_SCRIPT_RE.subn('', out)
        if n:
            notes.append(f'{n} <script>-Block(e) aus HTML entfernt.')
    if _INLINE_EVENT_RE.search(out):
        out2, n = _INLINE_EVENT_RE.subn('', out)
        if n:
            notes.append(f'{n} Inline-Event-Handler aus HTML entfernt.')
            out = out2
    if _IFRAME_EMBED_RE.search(out):
        out2, n = _IFRAME_EMBED_RE.subn('', out)
        if n:
            notes.append(f'{n} iframe/object/embed/form aus HTML entfernt.')
            out = out2
    out2, n = _JS_HREF_RE.subn(r'\1="#"', out)
    if n:
        notes.append(f'{n} javascript: URL(s) aus HTML entfernt.')
        out = out2
    out2, n = _META_REFRESH_RE.subn('', out)
    if n:
        notes.append('meta refresh aus HTML entfernt.')
        out = out2
    if _DISALLOWED_HTML_ROOT.search(out):
        notes.append('Hinweis: Vollständige Dokument-Tags sollten nicht im Fragment vorkommen.')
    return out, notes


def validate_html_fragment(html: str) -> list[str]:
    errs: list[str] = []
    h = html or ''
    if len(h) > MAX_HTML_LEN:
        errs.append(f'HTML überschreitet {MAX_HTML_LEN} Zeichen.')
    if _HTML_SCRIPT_OPEN.search(h):
        errs.append('HTML enthält weiterhin <script>.')
    if _INLINE_EVENT_RE.search(h):
        errs.append('HTML enthält Inline-Event-Handler.')
    if _IFRAME_EMBED_RE.search(h):
        errs.append('HTML enthält iframe/object/embed oder form.')
    if _JS_HREF_RE.search(h):
        errs.append('HTML enthält javascript: URLs.')
    return errs


def sanitize_css(raw: str) -> tuple[str, list[str]]:
    out = raw or ''
    notes: list[str] = []
    if len(out) > MAX_CSS_LEN:
        out = out[:MAX_CSS_LEN]
        notes.append(f'CSS auf {MAX_CSS_LEN} Zeichen gekürzt.')
    if _CSS_IMPORT_RE.search(out):
        out2, n = _CSS_IMPORT_RE.subn('/* @import entfernt */', out)
        if n:
            notes.append(f'{n} @import aus CSS entfernt/ersetzt.')
            out = out2

    def _strip_external_url(m: re.Match[str]) -> str:
        url = (m.group(2) or '').strip()
        low = url.lower()
        if low.startswith('data:') or low.startswith('#') or not url:
            return m.group(0)
        if low.startswith('/board-assets/') or low.startswith('/board-libs/') or low.startswith('/board-datasets/'):
            return m.group(0)
        if '://' in low or low.startswith('//'):
            return '/* external url removed */'
        return m.group(0)

    out = _CSS_URL_RE.sub(_strip_external_url, out)
    if _CSS_POSITION_FIXED_RE.search(out):
        notes.append('Hinweis: position: fixed kann die Bühne überlagern.')
    return out, notes


def validate_css(css: str) -> list[str]:
    errs: list[str] = []
    c = css or ''
    if len(c) > MAX_CSS_LEN:
        errs.append(f'CSS überschreitet {MAX_CSS_LEN} Zeichen.')
    if _CSS_IMPORT_RE.search(c):
        errs.append('CSS enthält @import.')
    return errs


def validate_javascript(js: str) -> list[str]:
    errs: list[str] = []
    j = js or ''
    if len(j) > MAX_JS_LEN:
        errs.append(f'JavaScript überschreitet {MAX_JS_LEN} Zeichen.')
    for label, pattern in _FORBIDDEN_JS_PATTERNS:
        if pattern.search(j):
            errs.append(f'JavaScript enthält nicht erlaubtes Muster: {label}.')
    return errs


def warn_javascript(js: str) -> list[str]:
    warns: list[str] = []
    j = js or ''
    for label, pattern in _WARN_JS_PATTERNS:
        if pattern.search(j):
            warns.append(label)
    return warns


def sanitize_javascript(raw: str) -> tuple[str, list[str]]:
    """Entfernt keine Tokens automatisch — nur Längenbegrenzung."""
    notes: list[str] = []
    out, n = _clip(raw or '', MAX_JS_LEN)
    if n:
        notes.extend(n)
    return out, notes


def sanitize_free_html_bundle(payload: dict[str, Any]) -> dict[str, Any]:
    """Wendet Sanitizer auf html/css/javascript an und normalisiert Metadaten."""
    html = str(payload.get('html') or '')
    css = str(payload.get('css') or '')
    javascript = str(payload.get('javascript') or '')

    warnings = list(payload.get('warnings') or []) if isinstance(payload.get('warnings'), list) else []

    html, w1 = sanitize_html_fragment(html)
    css, w2 = sanitize_css(css)
    javascript, w3 = sanitize_javascript(javascript)

    for w in w1 + w2 + w3:
        if w not in warnings:
            warnings.append(w)

    return {
        'html': html,
        'css': css,
        'javascript': javascript,
        'teacher_notes': str(payload.get('teacher_notes') or '')[:8000],
        'usage_instructions': [
            str(x) for x in (payload.get('usage_instructions') or []) if x
        ][:50],
        'warnings': warnings[:50],
        'used_libraries': [str(x) for x in (payload.get('used_libraries') or []) if x][:20],
        'used_assets': [str(x) for x in (payload.get('used_assets') or []) if x][:80],
        'used_datasets': [str(x) for x in (payload.get('used_datasets') or []) if x][:20],
    }


def validate_free_html_bundle(bundle: dict[str, Any]) -> tuple[bool, list[str], list[str]]:
    """Prüft sanitizierten Bundle-Inhalt — gibt (ok, errors, warnings) zurück."""
    errs: list[str] = []
    warns: list[str] = []
    html = str(bundle.get('html') or '')
    css = str(bundle.get('css') or '')
    js = str(bundle.get('javascript') or '')
    errs.extend(validate_html_fragment(html))
    errs.extend(validate_css(css))
    errs.extend(validate_javascript(js))
    warns.extend(warn_javascript(js))
    return len(errs) == 0, errs, warns
