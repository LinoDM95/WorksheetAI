"""Abschluss nach Polish/Touch: Skript-/Runtime-Probleme erkennen und einmal gezielt reparieren."""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

from apps.ai.prompt_loader import build_repair_mode_prompt
from apps.ai.providers.gemini import FREE_HTML_REVISION_SCHEMA, GeminiWorksheetProvider

from .free_html_library_usage_audit import audit_optional_library_usage
from .free_html_sanitize import validate_free_html_bundle
from .free_html_surgical_edits import normalize_provider_free_html_response
from .free_html_visual_qa import default_visual_qa_document_base, run_visual_layout_qa

logger = logging.getLogger(__name__)


def script_closure_enabled() -> bool:
    return bool(getattr(settings, 'SMARTBOARD_ENABLE_SCRIPT_CLOSURE_PASS', True))


def _is_script_related_qa_message(msg: str) -> bool:
    m = (msg or '').lower()
    needles = (
        'javascript-fehler',
        'skriptfehler',
        'laufzeitfehler',
        'konsole:',
        'syntaxerror',
        'referenceerror',
        'typeerror',
        'rangeerror',
        'urierror',
        'net::err',
        'failed to load',
        'ressourcenfehler',
        'javascript:',
    )
    return any(n in m for n in needles)


def collect_script_closure_issues(
    bundle: dict[str, Any],
    *,
    visual_qa_enabled: bool,
    document_base_href: str,
    post_load_delay_ms: int,
) -> list[str]:
    issues = list(audit_optional_library_usage(bundle))
    if not visual_qa_enabled:
        return issues
    try:
        vis_errs, _vis_warns = run_visual_layout_qa(
            bundle,
            document_base_href=document_base_href,
            post_load_delay_ms=post_load_delay_ms,
        )
    except Exception:  # noqa: BLE001
        logger.exception('Script closure: Headless-QA fehlgeschlagen')
        return issues
    for e in vis_errs:
        if _is_script_related_qa_message(str(e)):
            issues.append(str(e).strip())
    return issues


def run_script_closure_pass(
    provider: Any,
    *,
    bundle: dict[str, Any],
    last_raw: dict[str, Any],
    resource_ctx: dict[str, Any],
    context_hint: str,
    board_didactic: dict[str, str] | None = None,
    visual_qa_enabled: bool = False,
    document_base_href: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Ein optionaler LLM-Schritt nur wenn Audit/Konsole Laufzeit-/Lib-Probleme meldet."""
    trace: dict[str, Any] = {
        'round': 'script_closure',
        'ran': False,
        'accepted': False,
    }
    if not script_closure_enabled():
        trace['skipped'] = 'disabled_setting'
        return last_raw, bundle, trace

    base_bundle = dict(bundle or {})
    base_href = (document_base_href or '').strip() or default_visual_qa_document_base()

    delay_ms = int(getattr(settings, 'BOARDS_SCRIPT_CLOSURE_HEADLESS_DWELL_MS', 2200))
    delay_ms = max(800, min(delay_ms, 8000))

    issues_before = collect_script_closure_issues(
        base_bundle,
        visual_qa_enabled=visual_qa_enabled,
        document_base_href=base_href,
        post_load_delay_ms=delay_ms,
    )
    trace['issues_before'] = len(issues_before)
    if not issues_before:
        trace['skipped'] = 'no_script_issues'
        return last_raw, bundle, trace

    base_struct_ok, base_s_errs, _w0 = validate_free_html_bundle(base_bundle)
    base_struct_n = len(base_s_errs)
    if not base_struct_ok:
        trace['skipped'] = 'struct_not_clean'
        trace['detail'] = 'bundle nicht strukturell valide — kein Closure-Repair'
        return last_raw, bundle, trace

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
        'validation_errors': issues_before,
        'repair_attempt': 1,
        'repair_attempt_max': 1,
        'context_hint': (
            (context_hint or '').strip()
            + '\n\n[Skript-Abschluss] Nur die gemeldeten Laufzeit-/Bibliotheksfehler beheben — '
            'Didaktik und Layout unverändert lassen.'
        ),
        'style_dna': {},
        'touch_audit': {},
        'screenshot_quality': {},
    }
    prompt = build_repair_mode_prompt('script_fix', payload)

    repaired_raw: dict[str, Any] = {}
    try:
        repaired_raw = _invoke_closure_model(provider, prompt)
    except Exception:
        logger.exception('Script closure: Provider-Aufruf fehlgeschlagen')
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
        logger.info('Script closure: chirurgische Antwort ungültig — Rollback (%s)', exc)
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
            'Script closure: strukturelle Regression — Rollback (vor=%s nach=%s)',
            base_struct_n,
            len(s_errs),
        )
        trace['rejected'] = 'structural_regression'
        trace['structural_before'] = base_struct_n
        trace['structural_after'] = len(s_errs)
        return last_raw, bundle, trace

    issues_after = collect_script_closure_issues(
        candidate,
        visual_qa_enabled=visual_qa_enabled,
        document_base_href=base_href,
        post_load_delay_ms=delay_ms,
    )
    trace['issues_after'] = len(issues_after)
    if len(issues_after) > len(issues_before):
        logger.info(
            'Script closure: mehr Probleme als vorher — Rollback (vor=%s nach=%s)',
            len(issues_before),
            len(issues_after),
        )
        trace['rejected'] = 'script_issues_regression'
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


def _invoke_closure_model(provider: Any, prompt: str) -> dict[str, Any]:
    large_model = str(
        getattr(settings, 'SMARTBOARD_LARGE_MODEL', getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-pro')),
    )
    temp = float(getattr(settings, 'BOARDS_SCRIPT_CLOSURE_TEMPERATURE', 0.28))
    response_schema = FREE_HTML_REVISION_SCHEMA if isinstance(provider, GeminiWorksheetProvider) else None
    if not hasattr(provider, 'call_with_model'):
        logger.warning('Script closure: Provider ohne call_with_model — übersprungen')
        return {}
    data = provider.call_with_model(
        model=large_model,
        prompt=prompt,
        response_schema=response_schema,
        temperature=temp,
        trace_step='repair',
    )
    return data if isinstance(data, dict) else {}
