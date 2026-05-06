"""Validierungs-Reparatur-Schleife für KI-erzeugte Free-HTML5-Bundles.

Nach Modellantwort: sanitizen + ``validate_free_html_bundle``. Schlägt die Prüfung fehl und
Liegt noch Reparatur-Budget (**max. eine** zusätzliche KI-Reparaturrunde beim
Standard-Setting ``BOARDS_FREE_HTML_MAX_REPAIR_ATTEMPTS``), wird **einmal** repariert
und erneut geprüft — kein iterative „bis alles grün ist“ ohne weiteres Budget.
"""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

from apps.boards.services.free_html_sanitize import validate_free_html_bundle
from apps.boards.services.free_html_visual_qa import (
    default_visual_qa_document_base,
    run_visual_layout_qa,
)

logger = logging.getLogger(__name__)


def _max_repairs() -> int:
    v = getattr(settings, 'BOARDS_FREE_HTML_MAX_REPAIR_ATTEMPTS', 2)
    try:
        n = int(v)
    except (TypeError, ValueError):
        n = 2
    return max(0, min(n, 5))


def _sanitize_validate_payload(raw: dict[str, Any]) -> tuple[dict[str, Any], bool, list[str], list[str]]:
    from apps.boards.services.free_html_generation import FreeHtmlBoardGenerationService

    bundle = FreeHtmlBoardGenerationService.sanitize_payload(raw if isinstance(raw, dict) else {})
    ok, errs, warns = validate_free_html_bundle(bundle)
    return bundle, ok, errs, warns


def run_validation_repairs(
    provider: Any,
    *,
    initial_raw: dict[str, Any],
    resource_ctx: dict[str, Any],
    context_hint: str = '',
    max_repairs: int | None = None,
    visual_qa: bool = False,
    document_base_href: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any], bool, list[str], list[str], list[dict[str, Any]]]:
    """
    Parameters
    ----------
    provider :
        Muss ``repair_free_html_board(payload: dict) -> dict`` implementieren.
    initial_raw :
        Rohes Modell-JSON (oder Teil davon); wird wie bei der Erstellung über ``sanitize_payload`` geführt.
    resource_ctx :
        Kontext für den Repair-Prompt (z. B. ``libraries_summary`` …), unverändert durchreichen.
    context_hint :
        Kurzer Freitext (Thema/Prompt-Auszug) — nur Orientierung, keine neue Aufgabenstellung.
    max_repairs :
        Optionaler Override; Standard aus ``BOARDS_FREE_HTML_MAX_REPAIR_ATTEMPTS``.
    visual_qa :
        Nach erfolgreicher struktureller Validierung: Headless-Layoutprüfung (Playwright).
    document_base_href :
        Absolute Basis-URL für ``<base href>`` (Vite-Origin mit /board-libs). Leer = Setting-Default.

    Returns
    -------
    last_ai_raw, bundle, ok, errors, warnings, trace
        ``last_ai_raw`` ist die zuletzt vom Provider gelieferte dict (Erst- oder Reparatur-Antwort).
    """
    cap = _max_repairs() if max_repairs is None else max(0, min(int(max_repairs), 5))
    current: dict[str, Any] = dict(initial_raw) if isinstance(initial_raw, dict) else {}
    last_ai_raw: dict[str, Any] = dict(current)
    trace: list[dict[str, Any]] = []
    base_href = (document_base_href or '').strip() or default_visual_qa_document_base()

    for repair_round in range(cap + 1):
        bundle, struct_ok, s_errs, s_warns = _sanitize_validate_payload(current)
        vis_errs: list[str] = []
        vis_warns: list[str] = []
        if struct_ok and visual_qa:
            vis_errs, vis_warns = run_visual_layout_qa(bundle, document_base_href=base_href)

        errs = list(s_errs) + [f'[Visuell] {e}' for e in vis_errs]
        warns = list(s_warns) + list(vis_warns)
        ok = struct_ok and len(s_errs) == 0 and len(vis_errs) == 0

        trace.append({
            'round': repair_round,
            'ok': ok,
            'structural_ok': struct_ok,
            'structural_error_count': len(s_errs),
            'visual_error_count': len(vis_errs),
            'error_count': len(errs),
            'errors': list(errs),
            'warning_count': len(warns),
        })
        if ok:
            logger.info(
                'Free-HTML-Bundle validiert (Runde %s, Reparatur-Cap=%s, visual_qa=%s).',
                repair_round,
                cap,
                visual_qa,
            )
            return last_ai_raw, bundle, True, errs, warns, trace

        if repair_round >= cap:
            logger.warning(
                'Free-HTML-Bundle nach %s Validierungsrunden noch fehlerhaft (%s Fehler).',
                repair_round + 1,
                len(errs),
            )
            return last_ai_raw, bundle, False, errs, warns, trace

        logger.info(
            'Free-HTML Reparatur KI: Runde %s/%s, %s Validierungsfehler.',
            repair_round + 1,
            cap,
            len(errs),
        )
        payload = {
            **resource_ctx,
            'html': bundle.get('html') or '',
            'css': bundle.get('css') or '',
            'javascript': bundle.get('javascript') or '',
            'teacher_notes': bundle.get('teacher_notes') or '',
            'usage_instructions': list(bundle.get('usage_instructions') or []),
            'warnings': list(bundle.get('warnings') or []),
            'used_libraries': list(bundle.get('used_libraries') or []),
            'used_assets': list(bundle.get('used_assets') or []),
            'used_datasets': list(bundle.get('used_datasets') or []),
            'validation_errors': errs,
            'repair_attempt': repair_round + 1,
            'repair_attempt_max': cap,
            'context_hint': (context_hint or '').strip()
            or '*(Kein zusätzlicher Kontext — nur Validierungsfehler beheben.)*',
        }
        try:
            repaired = provider.repair_free_html_board(payload)
        except Exception:
            logger.exception('Free-HTML-Validierungsreparatur beim Provider fehlgeschlagen')
            raise
        if not isinstance(repaired, dict):
            repaired = {}

        last_ai_raw = repaired
        merged = {**bundle, **{k: v for k, v in repaired.items() if v is not None}}
        current = merged

    raise RuntimeError('run_validation_repairs: unreachable')
