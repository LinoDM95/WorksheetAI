"""SVG-Validation und -Security ohne KI.

Blocker führen zu Pflicht-Repair (oder Fallback). Warnungen sind weich und
beeinflussen den Quality Score, nicht die Auslieferung.

Die Funktion ``validate_svg`` ist parser-unabhängig (Regex), damit sie auch
gegen unvollständige LLM-Outputs deterministisch reagiert.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


# Maximalwerte (sinnvolle Defaults — bewusst großzügig).
MAX_SVG_BYTES = 200_000          # 200 KB normalisiertes SVG
MAX_SVG_PATHS = 200              # Pfadanzahl ab der wir warnen
MAX_SVG_COLORS = 12              # eindeutige Farb-Tokens (#hex / rgb)
MAX_OUTSIDE_OFFSET_PCT = 50.0    # Element ragt > 50 % der viewBox raus → Warnung


_SCRIPT_RE = re.compile(r'<\s*script\b', re.IGNORECASE)
_FOREIGNOBJECT_RE = re.compile(r'<\s*foreignObject\b', re.IGNORECASE)
_EVENT_HANDLER_RE = re.compile(r'\s+on[a-z]+\s*=\s*["\']', re.IGNORECASE)
_EXTERNAL_HREF_RE = re.compile(
    r'(?:href|xlink:href)\s*=\s*["\']\s*(https?:|//|data:|file:|ftp:|javascript:)',
    re.IGNORECASE,
)
_IMAGE_HREF_RE = re.compile(
    r'<\s*image\b[^>]*\b(?:href|xlink:href)\s*=\s*["\']([^"\']+)["\']',
    re.IGNORECASE,
)
_VIEWBOX_RE = re.compile(r'\bviewBox\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_WIDTH_RE = re.compile(r'\bwidth\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_HEIGHT_RE = re.compile(r'\bheight\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_ROOT_SVG_RE = re.compile(r'<\s*svg\b[^>]*>', re.IGNORECASE)
_PATH_TAG_RE = re.compile(r'<\s*path\b', re.IGNORECASE)
_TITLE_RE = re.compile(r'<\s*title\b[^>]*>', re.IGNORECASE)
_DESC_RE = re.compile(r'<\s*desc\b[^>]*>', re.IGNORECASE)
_HEX_COLOR_RE = re.compile(r'#[0-9a-fA-F]{3,8}\b')
_RGB_COLOR_RE = re.compile(r'rgba?\s*\([^)]+\)', re.IGNORECASE)
_HSL_COLOR_RE = re.compile(r'hsla?\s*\([^)]+\)', re.IGNORECASE)
_USE_HREF_LOCAL_RE = re.compile(r'<\s*use\b[^>]*\b(?:href|xlink:href)\s*=\s*["\']\s*#', re.IGNORECASE)


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str]
    warnings: list[str]
    metrics: dict[str, int | float]


def validate_svg(
    svg: str,
    *,
    background_mode: str | None = None,
    asset_type: str | None = None,
) -> ValidationResult:
    """Liefert Blocker-/Warning-Listen + technische Metriken für ``svg``.

    ``background_mode`` ('transparent_cutout', 'full_background', ...) erlaubt
    eine background-spezifische Heuristik (z. B. „transparent_cutout darf
    keinen vollen Hintergrund haben").
    """

    errors: list[str] = []
    warnings: list[str] = []
    metrics: dict[str, int | float] = {
        'bytes': 0, 'paths': 0, 'colors': 0,
        'has_viewbox': 0, 'has_title': 0, 'has_desc': 0,
    }

    body = (svg or '').strip()
    metrics['bytes'] = len(body)

    if not body:
        errors.append('SVG ist leer.')
        return ValidationResult(False, errors, warnings, metrics)

    if len(body) > MAX_SVG_BYTES:
        errors.append(f'SVG überschreitet {MAX_SVG_BYTES} Bytes ({len(body)}).')

    if not _ROOT_SVG_RE.search(body):
        errors.append('Root-Element <svg> fehlt.')

    if _SCRIPT_RE.search(body):
        errors.append('SVG enthält <script>.')
    if _FOREIGNOBJECT_RE.search(body):
        errors.append('SVG enthält <foreignObject>.')
    if _EVENT_HANDLER_RE.search(body):
        errors.append('SVG enthält Inline-Event-Handler (on*=).')
    if _EXTERNAL_HREF_RE.search(body):
        errors.append('SVG enthält externe href/xlink:href (URL).')

    # <image href="..."> nur erlaubt mit lokalem /board-generated-assets/-Prefix.
    for match in _IMAGE_HREF_RE.finditer(body):
        href = (match.group(1) or '').strip().lower()
        if not (href.startswith('/board-generated-assets/') or href.startswith('#')):
            errors.append(f'<image> mit unzulässiger href: {href[:80]}')

    viewbox = _VIEWBOX_RE.search(body)
    has_size = bool(_WIDTH_RE.search(body) and _HEIGHT_RE.search(body))
    if viewbox:
        metrics['has_viewbox'] = 1
        # viewBox-Parser: 4 Zahlen erwartet
        parts = re.findall(r'-?\d+(?:\.\d+)?', viewbox.group(1))
        if len(parts) != 4:
            warnings.append('viewBox sollte vier Zahlen enthalten.')
    elif not has_size:
        errors.append('SVG hat weder viewBox noch width/height.')
    else:
        warnings.append('viewBox fehlt — empfohlen für saubere Skalierung.')

    metrics['paths'] = len(_PATH_TAG_RE.findall(body))
    if metrics['paths'] > MAX_SVG_PATHS:
        warnings.append(f'Zu viele <path>-Elemente ({metrics["paths"]}).')

    colors = set()
    for pattern in (_HEX_COLOR_RE, _RGB_COLOR_RE, _HSL_COLOR_RE):
        for match in pattern.finditer(body):
            colors.add(match.group(0).lower())
    metrics['colors'] = len(colors)
    if metrics['colors'] > MAX_SVG_COLORS:
        warnings.append(f'Viele unterschiedliche Farben ({metrics["colors"]}).')

    if _TITLE_RE.search(body):
        metrics['has_title'] = 1
    else:
        warnings.append('Kein <title> — Accessibility-Warnung.')
    if _DESC_RE.search(body):
        metrics['has_desc'] = 1
    else:
        warnings.append('Kein <desc> — Accessibility-Warnung.')

    if background_mode == 'transparent_cutout':
        # Heuristik: vollflächiger rect/path über (oder nahe) das gesamte viewBox.
        if _has_full_background(body):
            warnings.append('Hintergrund-Mode transparent_cutout, aber vollflächiges Hintergrundelement erkannt.')
    elif background_mode == 'full_background':
        if not _has_full_background(body):
            warnings.append('Hintergrund-Mode full_background, aber kein vollflächiges Hintergrundelement gefunden.')

    if asset_type and metrics['paths'] == 0 and not re.search(r'<\s*(circle|rect|ellipse|polygon|line|use)\b', body):
        warnings.append('SVG enthält weder <path> noch andere Formelemente — wahrscheinlich leer.')

    ok = not errors
    return ValidationResult(ok, errors, warnings, metrics)


def _has_full_background(body: str) -> bool:
    # Sehr grob: Wir suchen <rect> mit width="100%" / height="100%" oder large fill ohne Begrenzung.
    if re.search(
        r'<\s*rect\b[^>]*width\s*=\s*["\']\s*100%\s*["\'][^>]*height\s*=\s*["\']\s*100%',
        body,
        re.IGNORECASE,
    ):
        return True
    if re.search(
        r'<\s*rect\b[^>]*\bx\s*=\s*["\']\s*0\s*["\'][^>]*\by\s*=\s*["\']\s*0\s*["\']',
        body,
        re.IGNORECASE,
    ):
        # Plus großes width/height (geschätzt > 256)
        m = re.search(r'<\s*rect\b[^>]*\bwidth\s*=\s*["\']\s*(\d+(?:\.\d+)?)', body, re.IGNORECASE)
        if m and float(m.group(1)) >= 256:
            return True
    return False


def is_safe_svg(svg: str) -> bool:
    """Schnellprüfung: enthält ``svg`` keine Hard-Blocker?"""

    return validate_svg(svg).ok
