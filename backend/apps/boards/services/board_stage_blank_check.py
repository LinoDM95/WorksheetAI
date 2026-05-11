"""Erkennung leerer/weißer Board-Bühne (#board-root) nach Render + Screenshot.

Letzter objektiver Gate: DOM-Metriken + optional Anteil „nicht-weißer“ Pixel im PNG
(ohne Pillow, nur RGB/RGBA 8-bit, nicht-interlaced).
"""
from __future__ import annotations

import logging
import struct
import zlib
from pathlib import Path
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


def _paeth(left: int, up: int, up_left: int) -> int:
    p = left + up - up_left
    pa = abs(p - left)
    pb = abs(p - up)
    pc = abs(p - up_left)
    if pa <= pb and pa <= pc:
        return left
    if pb <= pc:
        return up
    return up_left


def _png_non_white_ratio(path: Path, *, sample_step: int = 3, near_white: int = 248) -> float | None:
    """Anteil Pixel, bei denen min(R,G,B) < near_white (0..1). None bei nicht unterstütztem PNG."""
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if len(data) < 24 or data[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    pos = 8
    width = height = bit_depth = color_type = inter = None
    idat: list[bytes] = []
    while pos + 8 <= len(data):
        length = struct.unpack_from('>I', data, pos)[0]
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b'IHDR':
            width, height, bit_depth, color_type, _comp, _filt, inter = struct.unpack('>IIBBBBB', chunk)
        elif ctype == b'IDAT':
            idat.append(chunk)
        elif ctype == b'IEND':
            break
    if (
        width is None
        or height is None
        or bit_depth != 8
        or inter != 0
        or not idat
        or width <= 0
        or height <= 0
    ):
        return None
    if color_type == 2:
        bpp = 3
    elif color_type == 6:
        bpp = 4
    else:
        return None

    raw = zlib.decompress(b''.join(idat))
    stride = width * bpp
    expected = height * (1 + stride)
    if len(raw) < expected:
        return None

    prev = bytearray(stride)
    non_white = 0
    sampled = 0
    ri = 0
    for _y in range(height):
        ft = raw[ri]
        ri += 1
        line = bytearray(raw[ri : ri + stride])
        ri += stride
        if ft == 1:
            for x in range(stride):
                left = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + left) & 0xFF
        elif ft == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif ft == 3:
            for x in range(stride):
                left = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 0xFF
        elif ft == 4:
            for x in range(stride):
                left = line[x - bpp] if x >= bpp else 0
                up = prev[x]
                up_left = prev[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + _paeth(left, up, up_left)) & 0xFF
        elif ft != 0:
            return None
        y_step = sample_step if (_y % sample_step == 0) else None
        if y_step is not None:
            for x in range(0, width, sample_step):
                o = x * bpp
                r, g, b = line[o], line[o + 1], line[o + 2]
                sampled += 1
                if r < near_white or g < near_white or b < near_white:
                    non_white += 1
        prev = line

    if sampled == 0:
        return None
    return non_white / sampled


def analyze_blank_stage(
    *,
    layout_metrics: dict[str, Any] | None,
    screenshot_path: str | Path | None,
) -> dict[str, Any]:
    """Heuristik: leere/weiße Bühne. Ergebnis für Pipeline + Prompts."""
    reasons: list[str] = []
    metrics = layout_metrics if isinstance(layout_metrics, dict) else {}
    path = Path(screenshot_path) if screenshot_path else None

    min_text = int(getattr(settings, 'SMARTBOARD_BLANK_STAGE_MIN_TEXT_CHARS', 12))
    strict_non_white = float(getattr(settings, 'SMARTBOARD_BLANK_STAGE_NON_WHITE_RATIO_STRICT', 0.004))
    relaxed_non_white = float(getattr(settings, 'SMARTBOARD_BLANK_STAGE_NON_WHITE_RATIO_RELAXED', 0.012))

    if not metrics or metrics.get('element_count') is None:
        pixel_ratio_early: float | None = None
        if path and path.is_file():
            try:
                pixel_ratio_early = _png_non_white_ratio(path)
            except Exception:  # noqa: BLE001
                pixel_ratio_early = None
        if pixel_ratio_early is None:
            return {
                'ran': False,
                'appears_blank': False,
                'reasons': ['kein_render_fuer_blank_check'],
                'non_white_ratio': None,
                'layout_metrics': metrics or {},
            }
        appears_early = pixel_ratio_early < strict_non_white
        return {
            'ran': True,
            'appears_blank': appears_early,
            'reasons': ['png_uniform_ohne_dom'] if appears_early else [],
            'non_white_ratio': pixel_ratio_early,
            'threshold': strict_non_white,
            'layout_metrics': metrics or {},
        }

    text = int(metrics.get('text_char_count') or 0)
    inter = int(metrics.get('interactive_count') or 0)
    media = int(metrics.get('visible_media_count') or 0)

    pixel_ratio: float | None = None
    if path and path.is_file():
        try:
            pixel_ratio = _png_non_white_ratio(path)
        except Exception:  # noqa: BLE001
            logger.exception('Blank-Check: PNG-Analyse fehlgeschlagen')
            pixel_ratio = None

    dom_has_content = text >= min_text or inter >= 1 or media >= 1
    threshold = relaxed_non_white if dom_has_content else strict_non_white

    appears = False
    if pixel_ratio is not None:
        if pixel_ratio < threshold:
            appears = True
            reasons.append(f'png_antell_nicht_weiss_unter_schwelle({pixel_ratio:.5f}<{threshold})')
    else:
        if not dom_has_content:
            appears = True
            reasons.append('kein_screenshot_dom_ohne_inhalt')

    if dom_has_content and pixel_ratio is not None and pixel_ratio >= threshold:
        appears = False
        reasons = []

    return {
        'ran': True,
        'appears_blank': appears,
        'reasons': reasons,
        'non_white_ratio': pixel_ratio,
        'threshold': threshold,
        'layout_metrics': metrics,
    }


def run_blank_stage_check(bundle: dict, *, board_id: str | None = None) -> dict[str, Any]:
    """Playwright + Metriken wie Screenshot-Judge, nur für den Blank-Gate."""
    from .screenshot_quality_judge import capture_board_stage_visuals

    if not getattr(settings, 'SMARTBOARD_ENABLE_BLANK_STAGE_CHECK', True):
        return {'ran': False, 'appears_blank': False, 'reasons': ['disabled']}

    try:
        shot, metrics = capture_board_stage_visuals(bundle, board_id=board_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception('Blank-Check: capture fehlgeschlagen')
        return {
            'ran': False,
            'appears_blank': False,
            'reasons': [f'capture_fehler:{str(exc)[:200]}'],
            'non_white_ratio': None,
            'layout_metrics': {},
        }

    out = analyze_blank_stage(layout_metrics=metrics, screenshot_path=shot)
    out['screenshot_path'] = str(shot) if shot else ''
    return out
