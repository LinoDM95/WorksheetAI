"""SVG-Normalizer / Sanitizer.

- Strippt gefährliche Attribute/Tags (script, foreignObject, event-handler, externe href).
- Setzt einen sauberen viewBox.
- Ergänzt ``<title>`` / ``<desc>`` (Accessibility).
- Vereinheitlicht IDs auf das Asset-Pack-Prefix (Kollisionsvermeidung beim Inline-Embedding).
- Optional: Palette an Design-Tokens angleichen (best-effort, keine harte Farb-Mappings).

Bewusst regex-basiert, damit es auch unvollständige LLM-Outputs überlebt.
SVGO/Node ist nicht zwingend — Hooks sind dokumentiert.
"""

from __future__ import annotations

import html
import re
import uuid


_SCRIPT_BLOCK_RE = re.compile(r'<\s*script\b[^>]*>.*?<\s*/\s*script\s*>', re.IGNORECASE | re.DOTALL)
_SCRIPT_SELF_RE = re.compile(r'<\s*script\b[^>]*/?\s*>', re.IGNORECASE)
_FOREIGNOBJECT_RE = re.compile(r'<\s*foreignObject\b[^>]*>.*?<\s*/\s*foreignObject\s*>', re.IGNORECASE | re.DOTALL)
_EVENT_HANDLER_ATTR_RE = re.compile(r'\s+on[a-z]+\s*=\s*("[^"]*"|\'[^\']*\')', re.IGNORECASE)
_EXTERNAL_HREF_RE = re.compile(
    r'\s+(href|xlink:href)\s*=\s*("(?:https?:|//|file:|ftp:|javascript:)[^"]*"|\'(?:https?:|//|file:|ftp:|javascript:)[^\']*\')',
    re.IGNORECASE,
)
_VIEWBOX_RE = re.compile(r'\bviewBox\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_WIDTH_RE = re.compile(r'\bwidth\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_HEIGHT_RE = re.compile(r'\bheight\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_ROOT_SVG_RE = re.compile(r'<\s*svg\b([^>]*)>', re.IGNORECASE)
_TITLE_BLOCK_RE = re.compile(r'<\s*title\b[^>]*>.*?<\s*/\s*title\s*>', re.IGNORECASE | re.DOTALL)
_DESC_BLOCK_RE = re.compile(r'<\s*desc\b[^>]*>.*?<\s*/\s*desc\s*>', re.IGNORECASE | re.DOTALL)
_ID_ATTR_RE = re.compile(r'\bid\s*=\s*"([^"]+)"', re.IGNORECASE)
_USE_HREF_RE = re.compile(r'(\bxlink:href|\bhref)\s*=\s*"#([^"]+)"', re.IGNORECASE)
_URL_REF_RE = re.compile(r'url\(\s*#([^)\s]+)\s*\)', re.IGNORECASE)


def normalize_svg(
    svg: str,
    *,
    title: str | None = None,
    description: str | None = None,
    width: int = 512,
    height: int = 512,
    id_prefix: str | None = None,
) -> str:
    """Liefert ein gesäubertes, wohlgeformtes SVG.

    Wenn ``svg`` keinen Root hat oder leer ist, wird ein Minimal-SVG mit
    ``title``/``desc``-Stub zurückgegeben — das vermeidet harte Crashes.
    """

    body = (svg or '').strip()
    if not body:
        return _empty_svg(title or 'Asset', description or 'Leerer Asset-Stub', width, height)

    # 1. Script/foreignObject/Event-Handler entfernen.
    body = _SCRIPT_BLOCK_RE.sub('', body)
    body = _SCRIPT_SELF_RE.sub('', body)
    body = _FOREIGNOBJECT_RE.sub('', body)
    body = _EVENT_HANDLER_ATTR_RE.sub('', body)
    body = _EXTERNAL_HREF_RE.sub('', body)

    # 2. Root-Element prüfen / ergänzen.
    root = _ROOT_SVG_RE.search(body)
    if not root:
        return _wrap_in_svg(body, title or 'Asset', description or '', width, height)

    # 3. viewBox sicherstellen.
    body = _ensure_viewbox(body, width, height)

    # 4. xmlns sicherstellen.
    body = _ensure_xmlns(body)

    # 5. ID-Prefix anwenden (Inline-Kollisionsschutz).
    if id_prefix:
        body = _prefix_ids(body, id_prefix)

    # 6. title/desc ergänzen — direkt nach Root einfügen, falls fehlt.
    body = _ensure_title_desc(body, title or '', description or '')

    return body.strip()


def _empty_svg(title: str, desc: str, width: int, height: int) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">'
        f'<title>{html.escape(title)}</title>'
        f'<desc>{html.escape(desc)}</desc>'
        f'</svg>'
    )


def _wrap_in_svg(body: str, title: str, desc: str, width: int, height: int) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">'
        f'<title>{html.escape(title)}</title>'
        f'<desc>{html.escape(desc)}</desc>'
        f'{body}'
        f'</svg>'
    )


def _ensure_viewbox(body: str, width: int, height: int) -> str:
    if _VIEWBOX_RE.search(body):
        return body
    # Width/height parsen, falls vorhanden — sonst Defaults.
    w = _parse_dim(_WIDTH_RE, body, width)
    h = _parse_dim(_HEIGHT_RE, body, height)
    return _ROOT_SVG_RE.sub(
        lambda m: f'<svg{m.group(1)} viewBox="0 0 {w} {h}">',
        body,
        count=1,
    )


def _parse_dim(pattern: re.Pattern, body: str, fallback: int) -> int:
    match = pattern.search(body)
    if not match:
        return fallback
    raw = match.group(1).strip()
    try:
        return max(1, int(float(raw.rstrip('px%')))) or fallback
    except ValueError:
        return fallback


def _ensure_xmlns(body: str) -> str:
    if 'xmlns="http://www.w3.org/2000/svg"' in body:
        return body
    return _ROOT_SVG_RE.sub(
        lambda m: f'<svg xmlns="http://www.w3.org/2000/svg"{m.group(1)}>',
        body,
        count=1,
    )


def _ensure_title_desc(body: str, title: str, desc: str) -> str:
    has_title = bool(_TITLE_BLOCK_RE.search(body))
    has_desc = bool(_DESC_BLOCK_RE.search(body))
    if has_title and has_desc:
        return body
    insertion = ''
    if not has_title:
        insertion += f'<title>{html.escape(title or "Asset")}</title>'
    if not has_desc:
        insertion += f'<desc>{html.escape(desc or "")}</desc>'
    if not insertion:
        return body
    return _ROOT_SVG_RE.sub(
        lambda m: f'<svg{m.group(1)}>{insertion}',
        body,
        count=1,
    )


def _prefix_ids(body: str, prefix: str) -> str:
    """Versieht alle id-Attribute und ihre Referenzen mit ``prefix-`` (Kollisionsschutz)."""

    safe_prefix = re.sub(r'[^a-zA-Z0-9_-]+', '-', prefix).strip('-') or 'asset'

    ids: list[str] = []

    def _rewrite_id(match: re.Match[str]) -> str:
        name = match.group(1)
        ids.append(name)
        return f'id="{safe_prefix}-{name}"'

    body = _ID_ATTR_RE.sub(_rewrite_id, body)
    if not ids:
        return body
    id_set = set(ids)

    def _rewrite_href(match: re.Match[str]) -> str:
        attr = match.group(1)
        target = match.group(2)
        if target in id_set:
            return f'{attr}="#{safe_prefix}-{target}"'
        return match.group(0)

    body = _USE_HREF_RE.sub(_rewrite_href, body)

    def _rewrite_url(match: re.Match[str]) -> str:
        target = match.group(1)
        if target in id_set:
            return f'url(#{safe_prefix}-{target})'
        return match.group(0)

    body = _URL_REF_RE.sub(_rewrite_url, body)
    return body


def make_id_prefix(seed: str | None = None) -> str:
    """Baut ein deterministisches kurzes ID-Präfix für Inline-Kollisionsschutz."""

    base = (seed or '').strip().lower() or uuid.uuid4().hex[:6]
    safe = re.sub(r'[^a-z0-9_-]+', '-', base)
    return safe[:24] or uuid.uuid4().hex[:8]


def extract_viewbox(svg: str) -> tuple[float, float, float, float] | None:
    match = _VIEWBOX_RE.search(svg or '')
    if not match:
        return None
    parts = re.findall(r'-?\d+(?:\.\d+)?', match.group(1))
    if len(parts) != 4:
        return None
    try:
        return tuple(float(p) for p in parts)  # type: ignore[return-value]
    except ValueError:
        return None
