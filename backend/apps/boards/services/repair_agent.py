"""RepairAgent — modusbasierte Reparatur eines Free-HTML-Boards.

Wickelt den existierenden Provider-Pfad ``repair_free_html_board`` ein, nutzt aber
**modusabhängige** Prompts (z. B. ``bug_fix`` minimal-invasiv vs. ``design_improve``
mit größerem Spielraum). Antworten können ``revision_kind`` / ``surgical_edits`` nutzen;
``normalize_provider_free_html_response`` wendet diese vor dem Merge an. Nach jeder Runde:
- ``sanitize_payload`` → ``validate_free_html_bundle``
- optionales ``run_visual_layout_qa`` (Playwright)
- optionales ``TouchAuditService``

Bricht ab, wenn alle Prüfungen passen oder der Cap erreicht ist.
"""
from __future__ import annotations

import json as _json
import logging
from typing import Any

from django.conf import settings

from apps.ai.providers.gemini import FREE_HTML_REVISION_SCHEMA, GeminiWorksheetProvider
from apps.ai.prompt_loader import build_repair_mode_prompt

from .ai_model_router import SmartboardAIModelRouter
from .free_html_prompt_context import build_resource_context
from .free_html_sanitize import validate_free_html_bundle
from .free_html_surgical_edits import normalize_provider_free_html_response
from .free_html_visual_qa import (
    default_visual_qa_document_base,
    run_visual_layout_qa,
    visual_qa_playwright_available,
)
from .touch_audit import TouchAuditService

logger = logging.getLogger(__name__)


# Map externe Revision/Repair-Modi auf interne Prompt-Dateinamen.
MODE_TO_PROMPT_KEY: dict[str, str] = {
    'bug_fix': 'bug_fix',
    'design_improve': 'design_improve',
    'touch_optimize': 'touch_optimize',
    'layout_fix': 'layout_fix',
    'performance_fix': 'performance_fix',
    'performance_improve': 'performance_improve',
    'factual_warning': 'factual_warning',
    'security_fix': 'security_fix',
    'general_repair': 'general_repair',
    'general': 'general_repair',
    'content_change': 'content_change',
    'simplify': 'simplify',
    'make_more_creative': 'make_more_creative',
}


def _max_repair_rounds(override: int | None) -> int:
    if override is not None:
        return max(0, min(int(override), 5))
    return max(0, min(int(getattr(settings, 'SMARTBOARD_MAX_AUTO_REPAIRS', 2)), 5))


def _sanitize_validate(raw: dict) -> tuple[dict, bool, list[str], list[str]]:
    from .free_html_generation import FreeHtmlBoardGenerationService

    bundle = FreeHtmlBoardGenerationService.sanitize_payload(raw if isinstance(raw, dict) else {})
    ok, errs, warns = validate_free_html_bundle(bundle)
    return bundle, ok, errs, warns


class RepairAgent:
    """Modus-getriebene Reparatur. Erfolgreiche Runde stoppt die Schleife."""

    def __init__(
        self,
        *,
        provider: Any,
        router: SmartboardAIModelRouter | None = None,
        style_dna: dict | None = None,
        creative_brief: dict | None = None,
        risk_analysis: dict | None = None,
        board_didactic: dict[str, str] | None = None,
        context_hint: str = '',
        run_visual_qa: bool = False,
        run_touch_audit: bool = True,
    ) -> None:
        self._provider = provider
        self._router = router  # Reserve für künftige kleine Modell-Calls (z. B. Repair-Klassifikation)
        self._style_dna = style_dna or {}
        self._brief = creative_brief or {}
        self._risk = risk_analysis or {}
        self._board_didactic = dict(board_didactic) if board_didactic else {}
        hint_cap = max(2_000, int(getattr(settings, 'AI_BOARD_REPAIR_CONTEXT_HINT_MAX_CHARS', 12_000)))
        self._context_hint = (context_hint or '').strip()[:hint_cap]
        self._run_visual_qa = bool(run_visual_qa)
        self._run_touch_audit = bool(run_touch_audit)

    @staticmethod
    def needs_repair(*, validation_errors: list[str], touch_audit: dict | None,
                     screenshot_quality: dict | None) -> bool:
        if validation_errors:
            return True
        if touch_audit and not touch_audit.get('passed', True):
            return True
        if screenshot_quality and screenshot_quality.get('overall_score', 100) < 60:
            return True
        return False

    def run(
        self,
        bundle: dict,
        *,
        mode: str = 'general',
        max_rounds: int | None = None,
        touch_audit_result: dict | None = None,
        screenshot_quality_result: dict | None = None,
    ) -> dict[str, Any]:
        cap = _max_repair_rounds(max_rounds)
        prompt_key = MODE_TO_PROMPT_KEY.get(mode, 'general_repair')
        history: list[dict[str, Any]] = []
        current = dict(bundle or {})
        href = default_visual_qa_document_base()
        run_visual = (
            self._run_visual_qa
            and visual_qa_playwright_available()
            and bool(href)
            and bool(getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True))
        )
        ctx = build_resource_context()

        # Audit-Resultate als JSON für den Prompt aufbereiten (kompakt).
        last_touch = touch_audit_result or {}
        last_screen = screenshot_quality_result or {}

        for round_idx in range(cap + 1):
            sanitized, ok, errs, warns = _sanitize_validate(current)
            visual_errs: list[str] = []
            if ok and run_visual:
                try:
                    visual_errs, _ = run_visual_layout_qa(sanitized, document_base_href=href)
                except Exception:  # noqa: BLE001 — Visual-QA-Fehler nicht hart
                    logger.exception('RepairAgent: Visual-QA fehlgeschlagen')
                    visual_errs = []
            all_errs = list(errs) + [f'[Visuell] {e}' for e in visual_errs]

            touch_audit_now: dict[str, Any] = last_touch
            if self._run_touch_audit and ok:
                try:
                    touch_audit_now = TouchAuditService(style_dna=self._style_dna).run(sanitized)
                except Exception:  # noqa: BLE001
                    logger.exception('RepairAgent: TouchAudit fehlgeschlagen')

            touch_blocking = bool(touch_audit_now and not touch_audit_now.get('passed', True))
            history.append({
                'round': round_idx,
                'mode': prompt_key,
                'ok': ok and not all_errs and not touch_blocking,
                'error_count': len(all_errs),
                'errors': list(all_errs)[:8],
                'touch_passed': touch_audit_now.get('passed', True),
                'touch_score': touch_audit_now.get('score'),
            })

            if ok and not all_errs and not touch_blocking:
                return {
                    'bundle': sanitized,
                    'ok': True,
                    'mode': prompt_key,
                    'rounds': round_idx,
                    'errors': all_errs,
                    'warnings': warns,
                    'touch_audit': touch_audit_now,
                    'screenshot_quality': last_screen,
                    'history': history,
                }

            if round_idx >= cap:
                return {
                    'bundle': sanitized,
                    'ok': False,
                    'mode': prompt_key,
                    'rounds': round_idx,
                    'errors': all_errs,
                    'warnings': warns,
                    'touch_audit': touch_audit_now,
                    'screenshot_quality': last_screen,
                    'history': history,
                }

            payload = {
                **ctx,
                **self._board_didactic,
                'html': sanitized.get('html') or '',
                'css': sanitized.get('css') or '',
                'javascript': sanitized.get('javascript') or '',
                'used_libraries': list(sanitized.get('used_libraries') or []),
                'used_assets': list(sanitized.get('used_assets') or []),
                'used_datasets': list(sanitized.get('used_datasets') or []),
                'validation_errors': all_errs,
                'repair_attempt': round_idx + 1,
                'repair_attempt_max': cap,
                'context_hint': self._context_hint
                or '*(Kein zusätzlicher Kontext — nur Probleme beheben.)*',
                'style_dna': self._style_dna,
                'touch_audit': touch_audit_now,
                'screenshot_quality': last_screen,
            }
            prompt = build_repair_mode_prompt(prompt_key, payload)

            try:
                # Repair nutzt das große Modell — wir rufen weiterhin den Provider direkt,
                # damit das vorhandene FREE_HTML_SCHEMA für strukturierte Antworten greift.
                # Wir injizieren den modus-spezifischen Prompt in repair_free_html_board.
                payload_for_provider = dict(payload)
                payload_for_provider['_explicit_prompt'] = prompt  # noqa: PIE810 — informativ
                repaired = self._call_provider_with_prompt(prompt, payload)
            except Exception as exc:  # noqa: BLE001
                logger.exception('RepairAgent: Provider-Aufruf fehlgeschlagen (mode=%s)', prompt_key)
                history[-1]['provider_error'] = str(exc)[:300]
                # Bei Provider-Fehler abbrechen, mit aktuellem Stand zurück.
                return {
                    'bundle': sanitized, 'ok': False, 'mode': prompt_key,
                    'rounds': round_idx + 1, 'errors': all_errs, 'warnings': warns,
                    'touch_audit': touch_audit_now, 'screenshot_quality': last_screen,
                    'history': history,
                }

            if not isinstance(repaired, dict):
                repaired = {}
            repaired = normalize_provider_free_html_response(
                repaired,
                base_html=sanitized.get('html') or '',
                base_css=sanitized.get('css') or '',
                base_javascript=sanitized.get('javascript') or '',
            )
            current = {**sanitized, **{k: v for k, v in repaired.items() if v is not None}}

        # Theoretisch unerreichbar — for-Loop endet immer in einem return.
        raise RuntimeError('RepairAgent.run: unreachable')

    def _call_provider_with_prompt(self, prompt: str, payload: dict) -> dict:
        """Großmodell-Repair: nutzt ``call_with_model`` wenn verfügbar, sonst Provider-Default.

        ``call_with_model`` gibt uns Kontrolle über das Modell und vermeidet das
        Default-Repair-Prompt. Falls das Provider-Backend keine ``call_with_model``-API hat,
        fallen wir auf ``repair_free_html_board`` zurück (klassischer Pfad).
        """
        large_model = str(getattr(settings, 'SMARTBOARD_LARGE_MODEL',
                                   getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-pro')))
        response_schema = FREE_HTML_REVISION_SCHEMA if isinstance(self._provider, GeminiWorksheetProvider) else None
        if hasattr(self._provider, 'call_with_model'):
            data = self._provider.call_with_model(
                model=large_model,
                prompt=prompt,
                response_schema=response_schema,
                temperature=float(getattr(settings, 'BOARDS_FREE_HTML_REPAIR_TEMPERATURE', 0.25)),
                trace_step='repair',
            )
            if isinstance(data, dict) and data:
                return data
        # Fallback: existierender Pfad
        try:
            return self._provider.repair_free_html_board(payload) or {}
        except Exception:  # noqa: BLE001
            logger.exception('RepairAgent: Fallback repair_free_html_board fehlgeschlagen')
            return {}


def serialize_audit_for_prompt(audit: dict | None, *, max_chars: int = 1200) -> str:
    """Hilfsfunktion: Audit-JSON für den Prompt kompakt darstellen."""
    if not audit:
        return '— keine Daten —'
    try:
        s = _json.dumps(audit, ensure_ascii=False, separators=(',', ':'))
    except (TypeError, ValueError):
        return '— Daten nicht serialisierbar —'
    return s if len(s) <= max_chars else s[:max_chars] + '…'
