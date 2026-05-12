"""Optional: zweiter LLM-Durchlauf nach erfolgreicher Validierung — nur visuelles Polish.

Kein Layout- oder Positionswechsel (laut Prompt); bei struktureller Regression
oder neuen Visuell-Fehlern wird der ursprüngliche Stand beibehalten.
"""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

from apps.ai.prompt_loader import build_repair_mode_prompt
from apps.ai.providers.gemini import FREE_HTML_REVISION_SCHEMA, GeminiWorksheetProvider

from .free_html_sanitize import validate_free_html_bundle
from .free_html_surgical_edits import normalize_provider_free_html_response
from .free_html_visual_qa import default_visual_qa_document_base, run_visual_layout_qa

logger = logging.getLogger(__name__)

_POLISH_ERR_PLACEHOLDER = [
    '(Automatisch) Zweiter Durchlauf „Visual Polish“ nach erfolgreicher Validierung — '
    'siehe Prompt ``repair_visual_polish``; keine echte Fehlerliste.',
]


def visual_polish_enabled() -> bool:
    return bool(getattr(settings, 'SMARTBOARD_ENABLE_VISUAL_POLISH_PASS', True))


def run_visual_polish_pass(
    provider: Any,
    *,
    bundle: dict[str, Any],
    last_raw: dict[str, Any],
    resource_ctx: dict[str, Any],
    context_hint: str,
    board_didactic: dict[str, str] | None = None,
    style_dna: dict[str, Any] | None = None,
    visual_qa: bool = False,
    document_base_href: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Ein Aufruf: visuelles Polish. Bei Fehler oder Regression: unveränderter Input.

    Returns
    -------
    last_raw_out, bundle_out, trace
    """
    trace: dict[str, Any] = {
        'round': 'visual_polish',
        'ran': False,
        'accepted': False,
    }
    if not visual_polish_enabled():
        trace['skipped'] = 'disabled_setting'
        return last_raw, bundle, trace

    base_bundle = dict(bundle or {})
    base_href = (document_base_href or '').strip() or default_visual_qa_document_base()

    base_struct_ok, base_s_errs, _base_warns = validate_free_html_bundle(base_bundle)
    base_struct_n = len(base_s_errs)
    base_vis: list[str] = []
    if base_struct_ok and visual_qa:
        try:
            base_vis, _ = run_visual_layout_qa(base_bundle, document_base_href=base_href)
        except Exception:  # noqa: BLE001
            logger.exception('Visual polish: Baseline Visual-QA fehlgeschlagen')
            base_vis = []

    ctx = dict(resource_ctx or {})
    payload: dict[str, Any] = {
        **ctx,
        **(board_didactic or {}),
        'html': base_bundle.get('html') or '',
        'css': base_bundle.get('css') or '',
        'javascript': base_bundle.get('javascript') or '',
        'teacher_notes': base_bundle.get('teacher_notes') or '',
        'usage_instructions': list(base_bundle.get('usage_instructions') or []),
        'warnings': list(base_bundle.get('warnings') or []),
        'used_libraries': list(base_bundle.get('used_libraries') or []),
        'used_assets': list(base_bundle.get('used_assets') or []),
        'used_datasets': list(base_bundle.get('used_datasets') or []),
        'validation_errors': _POLISH_ERR_PLACEHOLDER,
        'repair_attempt': 1,
        'repair_attempt_max': 1,
        'context_hint': (context_hint or '').strip()
        or '*(Kein Zusatzkontext — nur automatischer Visual-Polish.)*',
        'style_dna': style_dna or {},
        'touch_audit': {},
        'screenshot_quality': {},
    }
    prompt = build_repair_mode_prompt('visual_polish', payload)

    repaired_raw: dict[str, Any] = {}
    try:
        repaired_raw = _invoke_polish_model(provider, prompt)
    except Exception:
        logger.exception('Visual polish: Provider-Aufruf fehlgeschlagen')
        trace['ran'] = True
        trace['error'] = 'provider_exception'
        return last_raw, bundle, trace

    trace['ran'] = True
    if not isinstance(repaired_raw, dict) or not repaired_raw:
        trace['skipped'] = 'empty_provider_response'
        return last_raw, bundle, trace

    try:
        normalized = normalize_provider_free_html_response(
            repaired_raw,
            base_html=str(base_bundle.get('html') or ''),
            base_css=str(base_bundle.get('css') or ''),
            base_javascript=str(base_bundle.get('javascript') or ''),
        )
    except ValueError as exc:
        logger.info('Visual polish: chirurgische Antwort ungültig — Rollback (%s)', exc)
        trace['skipped'] = 'surgical_apply_failed'
        trace['detail'] = str(exc)[:400]
        return last_raw, bundle, trace

    merged_flat = {
        **base_bundle,
        **{k: v for k, v in normalized.items() if v is not None},
    }
    from .free_html_generation import FreeHtmlBoardGenerationService

    candidate = FreeHtmlBoardGenerationService.sanitize_payload(merged_flat)
    struct_ok, s_errs, w_new = validate_free_html_bundle(candidate)
    if not struct_ok or len(s_errs) > base_struct_n:
        logger.info(
            'Visual polish: strukturelle Regression — Rollback (vor=%s nach=%s)',
            base_struct_n,
            len(s_errs),
        )
        trace['rejected'] = 'structural_regression'
        trace['structural_before'] = base_struct_n
        trace['structural_after'] = len(s_errs)
        return last_raw, bundle, trace

    if visual_qa:
        try:
            vis_errs, _ = run_visual_layout_qa(candidate, document_base_href=base_href)
        except Exception:  # noqa: BLE001
            logger.exception('Visual polish: Visual-QA nach Polish fehlgeschlagen — Rollback')
            trace['rejected'] = 'visual_qa_exception'
            return last_raw, bundle, trace
        if len(vis_errs) > len(base_vis):
            logger.info(
                'Visual polish: mehr Visuell-Probleme als vorher — Rollback (vor=%s nach=%s)',
                len(base_vis),
                len(vis_errs),
            )
            trace['rejected'] = 'visual_qa_regression'
            trace['visual_before'] = len(base_vis)
            trace['visual_after'] = len(vis_errs)
            return last_raw, bundle, trace

    last_out = dict(last_raw) if isinstance(last_raw, dict) else {}
    for key in (
        'title', 'description', 'teacher_notes', 'usage_instructions', 'warnings',
        'html', 'css', 'javascript', 'used_libraries', 'used_assets', 'used_datasets',
    ):
        if key in normalized and normalized[key] is not None:
            last_out[key] = normalized[key]

    trace['accepted'] = True
    trace['warnings_merged'] = len(w_new)
    return last_out, candidate, trace


def _invoke_polish_model(provider: Any, prompt: str) -> dict[str, Any]:
    """Nutzt ``call_with_model`` (RepairAgent-kompatibel); ohne leeres Ergebnis kein Fallback."""
    large_model = str(
        getattr(settings, 'SMARTBOARD_LARGE_MODEL', getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-pro')),
    )
    temp = float(getattr(settings, 'BOARDS_VISUAL_POLISH_TEMPERATURE', 0.35))
    response_schema = FREE_HTML_REVISION_SCHEMA if isinstance(provider, GeminiWorksheetProvider) else None
    if not hasattr(provider, 'call_with_model'):
        logger.warning('Visual polish: Provider ohne call_with_model — übersprungen')
        return {}
    data = provider.call_with_model(
        model=large_model,
        prompt=prompt,
        response_schema=response_schema,
        temperature=temp,
        trace_step='repair',
    )
    return data if isinstance(data, dict) else {}
