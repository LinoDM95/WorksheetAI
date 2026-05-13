"""Öffentliche Bibliotheks-Fassung (Snapshot) vs. privater Bearbeitungsstand — analog zu Boards."""

from __future__ import annotations

import copy
from typing import Any

from django.utils import timezone

from apps.worksheets.models import Worksheet


def copy_live_worksheet_to_library_snapshot(ws: Worksheet) -> None:
    ws.library_snapshot_content = copy.deepcopy(ws.content) if isinstance(ws.content, dict) else {}
    ws.library_snapshot_render_model = (
        copy.deepcopy(ws.render_model) if isinstance(ws.render_model, dict) else {}
    )
    ws.library_snapshot_page_setup = copy.deepcopy(ws.page_setup) if isinstance(ws.page_setup, dict) else {}
    ws.library_snapshot_generation_meta = (
        copy.deepcopy(ws.generation_meta) if isinstance(ws.generation_meta, dict) else {}
    )
    ws.library_snapshot_subject = ws.subject or ''
    ws.library_snapshot_grade = ws.grade
    ws.library_snapshot_topic = ws.topic or ''
    ws.library_snapshot_at = timezone.now()


def worksheet_bundle_for_library_consumer(ws: Worksheet) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Content, Render-Modell und Seitenlayout wie in Bibliotheks-Vorschau / Übernehmen."""
    if getattr(ws, 'library_snapshot_at', None) is not None:
        c = ws.library_snapshot_content if isinstance(ws.library_snapshot_content, dict) else {}
        rm = ws.library_snapshot_render_model if isinstance(ws.library_snapshot_render_model, dict) else {}
        ps = ws.library_snapshot_page_setup if isinstance(ws.library_snapshot_page_setup, dict) else {}
        return c, rm, ps
    ic = ws.content if isinstance(ws.content, dict) else {}
    rm0 = ws.render_model if isinstance(ws.render_model, dict) else {}
    ps0 = ws.page_setup if isinstance(ws.page_setup, dict) else {}
    return ic, rm0, ps0


def worksheet_public_live_differs_from_snapshot(ws: Worksheet) -> bool:
    if not ws.is_catalog_listed():
        return False
    if getattr(ws, 'library_snapshot_at', None) is None:
        return False

    lc, lrm, lps = worksheet_bundle_for_library_consumer(ws)
    vc = ws.content if isinstance(ws.content, dict) else {}
    vrm = ws.render_model if isinstance(ws.render_model, dict) else {}
    vps = ws.page_setup if isinstance(ws.page_setup, dict) else {}

    def _stab(a: dict, b: dict) -> bool:
        import json

        return json.dumps(a, sort_keys=True, default=str) == json.dumps(b, sort_keys=True, default=str)

    if not _stab(lc, vc) or not _stab(lrm, vrm) or not _stab(lps, vps):
        return True
    if (ws.subject or '') != (ws.library_snapshot_subject or ''):
        return True
    if ws.grade != ws.library_snapshot_grade:
        return True
    if (ws.topic or '') != (ws.library_snapshot_topic or ''):
        return True
    g_live = ws.generation_meta if isinstance(ws.generation_meta, dict) else {}
    g_snap = ws.library_snapshot_generation_meta if isinstance(ws.library_snapshot_generation_meta, dict) else {}
    if not _stab(g_live, g_snap):
        return True
    return False


def worksheet_catalog_thumbnail_render_model(ws: Worksheet) -> dict | None:
    from apps.worksheets.services.worksheet_thumbnail_preview import first_page_render_model_for_thumbnail

    _c, rm, _ps = worksheet_bundle_for_library_consumer(ws)
    return first_page_render_model_for_thumbnail(rm)
