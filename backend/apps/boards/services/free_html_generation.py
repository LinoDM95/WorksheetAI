"""KI-Generierung und Revision für Free-HTML5-Boards (flat fields)."""
from __future__ import annotations

import json
import logging
from typing import Any, Callable

from django.conf import settings

from apps.ai.providers.factory import get_provider
from apps.ai.providers.claude import ClaudeWorksheetProvider
from apps.ai.providers.mock import MockWorksheetProvider

from ..models import Board, BoardRevision
from ..grade_bounds import resolve_board_grade_fields
from ..owner import resolve_board_owner
from .board_revision_head import create_initial_revision_if_absent, require_board_at_revision_head
from .free_html_prompt_context import build_resource_context
from .free_html_sanitize import (
    sanitize_free_html_bundle,
    validate_free_html_bundle,
)
from .free_html_surgical_edits import normalize_provider_free_html_response
from .free_html_validate_repair import run_validation_repairs
from .visual_resource_registry import (
    filter_used_assets,
    filter_used_datasets,
    filter_used_libraries,
)

logger = logging.getLogger(__name__)


def _visual_qa_for_pipeline() -> bool:
    """Headless-Visuelle QA in Generierung/Revision: immer an, sofern nicht serverseitig deaktiviert."""
    return bool(getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True))


def _board_metadata(board: Board) -> dict[str, Any]:
    return {
        'title': board.title,
        'description': board.description,
        'teacher_notes': board.teacher_notes,
        'usage_instructions': list(board.usage_instructions or []),
        'warnings': list(board.warnings or []),
        'used_libraries': list(board.used_libraries or []),
        'used_assets': list(board.used_assets or []),
        'used_datasets': list(board.used_datasets or []),
    }


def _select_provider(*, ai_quality_tier: str | None = None):
    forced = (getattr(settings, 'BOARDS_AI_PROVIDER', 'default') or 'default').strip().lower()
    if forced == 'mock':
        return MockWorksheetProvider()
    tier = (ai_quality_tier or '').strip().lower()
    if tier in ('ultra', 'claude'):
        key = (getattr(settings, 'CLAUDE_API_KEY', None) or '').strip()
        if not key:
            raise ValueError(
                'Ultra-Modus (Claude) ist nicht verfügbar: CLAUDE_API_KEY fehlt in der Server-Konfiguration.'
            )
        return ClaudeWorksheetProvider()
    if forced == 'claude':
        return ClaudeWorksheetProvider()
    return get_provider()


def _normalize_used_lists(raw: dict[str, Any]) -> dict[str, list[str]]:
    return {
        'used_libraries': filter_used_libraries(raw.get('used_libraries')),
        'used_assets': filter_used_assets(raw.get('used_assets')),
        'used_datasets': filter_used_datasets(raw.get('used_datasets')),
    }


def validate_free_html_code(html: str, css: str, javascript: str) -> tuple[bool, list[str], list[str]]:
    """Reine Pipeline-Funktion: nimmt Roh-Code, sanitisiert und validiert."""
    bundle = sanitize_free_html_bundle({
        'html': html or '',
        'css': css or '',
        'javascript': javascript or '',
    })
    return validate_free_html_bundle(bundle)


class FreeHtmlBoardGenerationService:
    """Erzeugt ein Free-HTML5-Board aus Lehrkraft-Eingaben."""

    def __init__(self, user, payload: dict[str, Any]):
        self.user = resolve_board_owner(user)
        self.payload = payload or {}

    @staticmethod
    def sanitize_payload(raw: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raw = {}
        used = _normalize_used_lists(raw)
        bundle = sanitize_free_html_bundle({
            'html': str(raw.get('html') or ''),
            'css': str(raw.get('css') or ''),
            'javascript': str(raw.get('javascript') or ''),
            'teacher_notes': str(raw.get('teacher_notes') or ''),
            'usage_instructions': raw.get('usage_instructions') or [],
            'warnings': raw.get('warnings') or [],
            **used,
        })
        return bundle

    def run(self) -> Board:
        from .pipeline_ai_meter import generation_meter_context

        tier = self.payload.get('ai_quality_tier')
        tier_s = tier.strip().lower() if isinstance(tier, str) else None
        provider = _select_provider(ai_quality_tier=tier_s)
        ai_payload = self._ai_payload()
        with generation_meter_context(user=self.user) as meter:
            try:
                raw = provider.generate_free_html_board(ai_payload)
            except Exception:
                logger.exception('Free-HTML-Board-Generierung beim AI-Provider fehlgeschlagen')
                raise

            if not isinstance(raw, dict):
                raw = {}
            ctx = build_resource_context()
            context_hint = (
                f'Fach: {self.payload.get("subject") or "—"}\n'
                f'Thema: {self.payload.get("topic") or "—"}\n'
                f'Auftrag (Auszug): {str(self.payload.get("prompt") or "")[:500]}'
            )
            last_raw, bundle, ok, verrs, vwarns, repair_trace = run_validation_repairs(
                provider,
                initial_raw=raw,
                resource_ctx=ctx,
                context_hint=context_hint,
                visual_qa=_visual_qa_for_pipeline(),
                document_base_href=None,
            )

            title = str(last_raw.get('title') or raw.get('title') or self.payload.get('topic') or 'Board')[:255]
            desc = str(last_raw.get('description') or raw.get('description') or '')[:5000]

            gf, gt, g_label = resolve_board_grade_fields(self.payload)

            gen_input = self._sanitized_input()
            gen_input['validation_repair_trace'] = repair_trace
            gen_input['visual_qa_pipeline'] = 'on' if _visual_qa_for_pipeline() else 'off'

            board = Board.objects.create(
                owner=self.user,
                title=title,
                description=desc,
                subject=str(self.payload.get('subject') or '')[:120],
                grade=g_label,
                grade_from=gf,
                grade_to=gt,
                topic=str(self.payload.get('topic') or '')[:220],
                board_type=str(self.payload.get('board_type') or 'interactive_board')[:40],
                status='generated' if ok else 'draft',
                html=bundle['html'],
                css=bundle['css'],
                javascript=bundle['javascript'],
                teacher_notes=bundle['teacher_notes'],
                usage_instructions=bundle['usage_instructions'],
                warnings=bundle['warnings'],
                used_libraries=bundle['used_libraries'],
                used_assets=bundle['used_assets'],
                used_datasets=bundle['used_datasets'],
                generation_prompt=str(self.payload.get('prompt') or '')[:8000],
                generation_input=gen_input,
                ai_raw_output=last_raw,
                validation_errors=verrs,
                validation_warnings=vwarns,
            )
            meter.flush_logs_to_board(board)
            create_initial_revision_if_absent(board, user=self.user, prompt='(Erstgenerierung)')
        return board

    def iter_ndjson(self, *, serialize_board: Callable[[Board], dict[Any, Any]]):
        """Legacy-Pfad: gleiche Logik wie ``run``, mit Fortschrittszeilen (NDJSON)."""
        from .pipeline_ai_meter import generation_meter_context

        def enc(obj: dict[str, Any]) -> bytes:
            return (json.dumps(obj, ensure_ascii=False) + '\n').encode('utf-8')

        tier = self.payload.get('ai_quality_tier')
        tier_s = tier.strip().lower() if isinstance(tier, str) else None
        provider = _select_provider(ai_quality_tier=tier_s)
        ai_payload = self._ai_payload()
        with generation_meter_context(user=self.user) as meter:
            yield enc({
                'event': 'phase',
                'key': 'codegen',
                'pct': 15,
                'label': 'Die KI erstellt dein interaktives Board …',
            })
            try:
                raw = provider.generate_free_html_board(ai_payload)
            except Exception:
                logger.exception('Free-HTML-Board-Generierung beim AI-Provider fehlgeschlagen')
                raise

            if not isinstance(raw, dict):
                raw = {}
            yield enc({
                'event': 'phase',
                'key': 'validate',
                'pct': 48,
                'label': 'Wir prüfen den Code auf Sicherheit und Struktur …',
            })
            ctx = build_resource_context()
            context_hint = (
                f'Fach: {self.payload.get("subject") or "—"}\n'
                f'Thema: {self.payload.get("topic") or "—"}\n'
                f'Auftrag (Auszug): {str(self.payload.get("prompt") or "")[:500]}'
            )
            last_raw, bundle, ok, verrs, vwarns, repair_trace = run_validation_repairs(
                provider,
                initial_raw=raw,
                resource_ctx=ctx,
                context_hint=context_hint,
                visual_qa=_visual_qa_for_pipeline(),
                document_base_href=None,
            )

            title = str(last_raw.get('title') or raw.get('title') or self.payload.get('topic') or 'Board')[:255]
            desc = str(last_raw.get('description') or raw.get('description') or '')[:5000]

            gf, gt, g_label = resolve_board_grade_fields(self.payload)

            gen_input = self._sanitized_input()
            gen_input['validation_repair_trace'] = repair_trace
            gen_input['visual_qa_pipeline'] = 'on' if _visual_qa_for_pipeline() else 'off'

            used = _normalize_used_lists(bundle)
            yield enc({
                'event': 'phase',
                'key': 'save',
                'pct': 92,
                'label': 'Fast fertig — wir speichern …',
            })
            board = Board.objects.create(
                owner=self.user,
                title=title,
                description=desc,
                subject=str(self.payload.get('subject') or '')[:120],
                grade=g_label,
                grade_from=gf,
                grade_to=gt,
                topic=str(self.payload.get('topic') or '')[:220],
                board_type=str(self.payload.get('board_type') or 'interactive_board')[:40],
                status='generated' if ok else 'draft',
                html=bundle['html'],
                css=bundle['css'],
                javascript=bundle['javascript'],
                teacher_notes=bundle['teacher_notes'],
                usage_instructions=bundle['usage_instructions'],
                warnings=bundle['warnings'],
                used_libraries=used['used_libraries'],
                used_assets=used['used_assets'],
                used_datasets=used['used_datasets'],
                generation_prompt=str(self.payload.get('prompt') or '')[:8000],
                generation_input=gen_input,
                ai_raw_output=last_raw,
                validation_errors=verrs,
                validation_warnings=vwarns,
            )
            meter.flush_logs_to_board(board)
            create_initial_revision_if_absent(board, user=self.user, prompt='(Erstgenerierung)')
            yield enc({'event': 'done', 'board': serialize_board(board)})

    def _ai_payload(self) -> dict[str, Any]:
        _, _, g_label = resolve_board_grade_fields(self.payload)
        return {
            'prompt': self.payload.get('prompt') or '',
            'subject': self.payload.get('subject') or '',
            'grade': g_label or str(self.payload.get('grade') or ''),
            'topic': self.payload.get('topic') or '',
            'board_type': self.payload.get('board_type') or 'interactive_board',
            'duration_minutes': int(self.payload.get('duration_minutes') or 10),
            'creativity': self.payload.get('creativity') or 'experimentell',
            'visual_style': self.payload.get('visual_style') or 'auto',
            'target_device': self.payload.get('target_device') or 'smartboard',
        }

    def _sanitized_input(self) -> dict[str, Any]:
        keep = (
            'prompt', 'subject', 'grade', 'grade_from', 'grade_to', 'topic', 'board_type', 'duration_minutes',
            'creativity', 'visual_style', 'target_device', 'ai_quality_tier',
        )
        return {k: self.payload.get(k) for k in keep if k in self.payload}


_REVISION_MODES = {
    'general', 'bug_fix', 'design_improve', 'touch_optimize',
    'content_change', 'simplify', 'make_more_creative', 'performance_improve',
}


class FreeHtmlBoardRevisionService:
    """Nachprompten für Free-HTML5-Boards.

    ``revision_mode`` steuert den Pfad: bei ``general`` klassischer Revisions-Prompt;
    sonst :class:`~apps.boards.services.repair_agent.RepairAgent` mit modus-spezifischem
    Prompt (z. B. ``bug_fix`` minimal-invasiv, ``simplify`` Lesbarkeit). Inhaltlicher
    Umfang (Slides, Level) darf nur gekürzt werden, wenn die Lehrkraft das im Freitext
    ausdrücklich verlangt — siehe Prompt-Schutzregeln in den Repair-Templates.
    """

    def __init__(self, board: Board, user_prompt: str, user, *,
                 ai_quality_tier: str | None = None, revision_mode: str | None = None):
        self.board = board
        self.user_prompt = (user_prompt or '').strip()[:4000]
        self.user = resolve_board_owner(user)
        t = (ai_quality_tier or '').strip().lower() if isinstance(ai_quality_tier, str) else None
        self._ai_quality_tier = t if t in ('ultra', 'claude', 'standard') else None
        mode = (revision_mode or 'general').strip().lower()
        self._revision_mode = mode if mode in _REVISION_MODES else 'general'

    def run(self) -> BoardRevision:
        if not self.user_prompt:
            raise ValueError('Bitte beschreibe deinen Änderungswunsch.')

        require_board_at_revision_head(self.board)

        from .pipeline_ai_meter import generation_meter_context

        provider = _select_provider(ai_quality_tier=self._ai_quality_tier)
        prev_meta = _board_metadata(self.board)

        with generation_meter_context(user=self.user) as meter:
            revision = self._run_revision_body(provider, prev_meta)
            meter.flush_logs_to_board(self.board)
            return revision

    def _run_revision_body(self, provider, prev_meta: dict[str, Any]) -> BoardRevision:
        # Spezialisierte Modi → RepairAgent (mode-spezifischer Prompt).
        if self._revision_mode != 'general':
            from .repair_agent import MODE_TO_PROMPT_KEY, RepairAgent

            current_bundle = {
                'html': self.board.html or '',
                'css': self.board.css or '',
                'javascript': self.board.javascript or '',
                'teacher_notes': self.board.teacher_notes or '',
                'usage_instructions': list(self.board.usage_instructions or []),
                'warnings': list(self.board.warnings or []),
                'used_libraries': list(self.board.used_libraries or []),
                'used_assets': list(self.board.used_assets or []),
                'used_datasets': list(self.board.used_datasets or []),
            }
            agent = RepairAgent(
                provider=provider,
                style_dna=self.board.style_dna or {},
                creative_brief=self.board.creative_brief or {},
                risk_analysis=self.board.risk_analysis or {},
                context_hint=f'Nutzer-Änderungswunsch:\n{self.user_prompt}',
                run_visual_qa=_visual_qa_for_pipeline(),
                run_touch_audit=bool(getattr(settings, 'SMARTBOARD_ENABLE_TOUCH_AUDIT', True)),
            )
            mode_key = MODE_TO_PROMPT_KEY.get(self._revision_mode, 'general_repair')
            result = agent.run(current_bundle, mode=mode_key)
            bundle = result.get('bundle') or current_bundle
            ok = bool(result.get('ok'))
            verrs = list(result.get('errors') or [])
            vwarns = list(result.get('warnings') or [])
            repair_trace = list(result.get('history') or [])
            last_raw = {'mode': self._revision_mode, 'rounds': result.get('rounds')}
            raw = {}
        else:
            try:
                raw = provider.revise_free_html_board(
                    {
                        'html': self.board.html or '',
                        'css': self.board.css or '',
                        'javascript': self.board.javascript or '',
                        'teacher_notes': self.board.teacher_notes or '',
                        'usage_instructions': list(self.board.usage_instructions or []),
                        'used_libraries': list(self.board.used_libraries or []),
                        'used_assets': list(self.board.used_assets or []),
                        'used_datasets': list(self.board.used_datasets or []),
                        'user_prompt': self.user_prompt,
                    },
                )
            except Exception:
                logger.exception('Free-HTML-Revision beim AI-Provider fehlgeschlagen')
                raise

            if not isinstance(raw, dict):
                raw = {}

            raw = normalize_provider_free_html_response(
                raw,
                base_html=self.board.html or '',
                base_css=self.board.css or '',
                base_javascript=self.board.javascript or '',
            )

            defaults = {
                'html': self.board.html or '',
                'css': self.board.css or '',
                'javascript': self.board.javascript or '',
                'teacher_notes': self.board.teacher_notes or '',
                'usage_instructions': list(self.board.usage_instructions or []),
                'warnings': list(self.board.warnings or []),
                'used_libraries': list(self.board.used_libraries or []),
                'used_assets': list(self.board.used_assets or []),
                'used_datasets': list(self.board.used_datasets or []),
            }
            merged = {**defaults, **{k: v for k, v in raw.items() if v is not None}}
            ctx = build_resource_context()
            hint = self.user_prompt.strip()[:600]
            last_raw, bundle, ok, verrs, vwarns, repair_trace = run_validation_repairs(
                provider,
                initial_raw=merged,
                resource_ctx=ctx,
                context_hint=f'Nutzer-Änderungswunsch:\n{hint}',
                visual_qa=_visual_qa_for_pipeline(),
                document_base_href=None,
            )

        previous_html = self.board.html or ''
        previous_css = self.board.css or ''
        previous_js = self.board.javascript or ''

        revision = BoardRevision.objects.create(
            board=self.board,
            prompt=self.user_prompt,
            revision_mode=self._revision_mode,
            previous_html=previous_html,
            previous_css=previous_css,
            previous_javascript=previous_js,
            new_html=bundle['html'],
            new_css=bundle['css'],
            new_javascript=bundle['javascript'],
            previous_metadata=prev_meta,
            new_metadata={
                'title': str(last_raw.get('title') or raw.get('title') or self.board.title)[:255],
                'description': str(
                    last_raw.get('description') or raw.get('description') or self.board.description or '',
                )[:5000],
                'teacher_notes': bundle['teacher_notes'],
                'usage_instructions': bundle['usage_instructions'],
                'warnings': bundle['warnings'],
                'used_libraries': bundle['used_libraries'],
                'used_assets': bundle['used_assets'],
                'used_datasets': bundle['used_datasets'],
                'validation_repair_trace': repair_trace,
            },
            ai_raw_output=last_raw,
            validation_errors=verrs,
            validation_warnings=vwarns,
            quality_report_before=dict(self.board.quality_report or {}),
            repair_notes=list(repair_trace or []),
            created_by=self.user,
        )

        self.board.html = bundle['html']
        self.board.css = bundle['css']
        self.board.javascript = bundle['javascript']
        self.board.teacher_notes = bundle['teacher_notes']
        self.board.usage_instructions = bundle['usage_instructions']
        self.board.warnings = bundle['warnings']
        self.board.used_libraries = bundle['used_libraries']
        self.board.used_assets = bundle['used_assets']
        self.board.used_datasets = bundle['used_datasets']
        self.board.validation_errors = verrs
        self.board.validation_warnings = vwarns
        self.board.status = 'generated' if ok else self.board.status
        if last_raw.get('title'):
            self.board.title = str(last_raw['title'])[:255]
        if last_raw.get('description') is not None:
            self.board.description = str(last_raw.get('description') or '')[:5000]
        self.board.save(
            update_fields=[
                'html', 'css', 'javascript',
                'teacher_notes', 'usage_instructions', 'warnings',
                'used_libraries', 'used_assets', 'used_datasets',
                'validation_errors', 'validation_warnings', 'status',
                'title', 'description', 'updated_at',
            ],
        )
        return revision
