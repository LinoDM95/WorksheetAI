"""Bausteinmodus-Service: KI füllt Bausteine, danach deterministisches Compose.

Eingabe vom Wizard ist ein **Plan** (Stichpunkte pro Seite + Block-Slots). Die KI
füllt die Bausteine (oder eine deterministische Heuristik), danach läuft
``compose_board`` und die Standard-Sandbox-Pipeline.
"""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

from ..models import Board
from ..grade_bounds import infer_bounds_from_grade_text
from ..owner import resolve_board_owner
from .board_revision_head import create_initial_revision_if_absent
from .blocks import (
    SpecValidationError,
    compose_board,
    validate_plan,
)
from .blocks.content_filling import fill_plan_with_ai
from .blocks.themes import resolve_theme
from .free_html_sanitize import (
    sanitize_free_html_bundle,
    validate_free_html_bundle,
)
from .free_html_validate_repair import run_validation_repairs
from .free_html_prompt_context import build_resource_context

logger = logging.getLogger(__name__)


def _visual_qa_for_pipeline() -> bool:
    return bool(getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True))


def _finishing_enabled() -> bool:
    return bool(getattr(settings, 'BOARDS_BLOCKS_FINISHING_ENABLED', True))


class FreeHtmlBlockBoardGenerationService:
    """Erzeugt ein Board aus einem CompositionPlan (Bausteinmodus).

    Public API:
        run() -> Board

    Hebt ``ValueError`` (mit deutscher Message) für Eingabefehler.
    """

    def __init__(self, user, raw_plan: dict[str, Any]):
        self.user = resolve_board_owner(user)
        self.raw_plan = raw_plan or {}

    def run(self) -> Board:
        from .pipeline_ai_meter import generation_meter_context

        try:
            plan = validate_plan(self.raw_plan)
        except SpecValidationError as exc:
            raise ValueError('; '.join(exc.errors)) from exc

        with generation_meter_context(user=self.user) as meter:
            spec, fill_notes = fill_plan_with_ai(plan)
            finishing = self._finishing_pass(spec)
            theme = resolve_theme(finishing.get('theme_id') or spec.theme_id)
            composed = compose_board(spec, theme=theme)

            sanitized = sanitize_free_html_bundle({
                'html': composed['html'],
                'css': composed['css'],
                'javascript': composed['javascript'],
                'teacher_notes': finishing.get('teacher_notes') or '',
                'usage_instructions': finishing.get('usage_instructions') or [],
                'warnings': [],
                'used_libraries': composed['used_libraries'],
                'used_assets': composed['used_assets'],
                'used_datasets': composed['used_datasets'],
            })
            ok, errs, warns = validate_free_html_bundle(sanitized)

            repair_trace: list[dict[str, Any]] = [{
                'round': 0,
                'ok': ok,
                'structural_ok': ok,
                'structural_error_count': len(errs),
                'visual_error_count': 0,
                'error_count': len(errs),
                'errors': list(errs),
                'warning_count': len(warns),
                'mode': 'blocks',
            }]

            if ok and _visual_qa_for_pipeline():
                try:
                    from .free_html_visual_qa import run_visual_layout_qa
                    vis_errs, vis_warns = run_visual_layout_qa(sanitized, document_base_href=None)
                    if vis_errs:
                        ok = False
                        errs = list(errs) + [f'[Visuell] {e}' for e in vis_errs]
                    warns = list(warns) + list(vis_warns)
                    repair_trace.append({
                        'round': 1,
                        'ok': ok,
                        'visual_error_count': len(vis_errs),
                        'warning_count': len(vis_warns),
                        'mode': 'blocks-visual-qa',
                    })
                except Exception:
                    logger.exception('Visuelle QA für Bausteinmodus übersprungen.')

            title = (spec.title or composed.get('title') or 'Board')[:255]
            desc = (spec.description or composed.get('description') or '')[:5000]

            gf, gt = infer_bounds_from_grade_text(str(spec.grade or ''))

            gen_input: dict[str, Any] = {
                'composition_mode': 'blocks',
                'composition_plan': self.raw_plan,
                'composition_spec': spec.model_dump(mode='python'),
                'theme_id': theme.id,
                'finishing_used': bool(finishing.get('source') == 'ai'),
                'finishing_payload': finishing,
                'fill_notes': fill_notes,
                'validation_repair_trace': repair_trace,
                'visual_qa_pipeline': 'on' if _visual_qa_for_pipeline() else 'off',
            }

            board = Board.objects.create(
                owner=self.user,
                title=title,
                description=desc,
                subject=str(spec.subject or '')[:120],
                grade=str(spec.grade or '')[:60],
                grade_from=gf,
                grade_to=gt,
                topic=str(spec.topic or '')[:220],
                board_type='interactive_board',
                status='generated' if ok else 'draft',
                html=sanitized['html'],
                css=sanitized['css'],
                javascript=sanitized['javascript'],
                teacher_notes=sanitized['teacher_notes'],
                usage_instructions=sanitized['usage_instructions'],
                warnings=sanitized['warnings'],
                used_libraries=sanitized['used_libraries'],
                used_assets=sanitized['used_assets'],
                used_datasets=sanitized['used_datasets'],
                generation_prompt='',
                generation_input=gen_input,
                ai_raw_output=finishing,
                validation_errors=errs,
                validation_warnings=warns,
            )
            meter.flush_logs_to_board(board)
            create_initial_revision_if_absent(board, user=self.user, prompt='(Bausteine, Erstfassung)')
        return board

    # ------------------------------------------------------------------ KI
    def _finishing_pass(self, spec) -> dict[str, Any]:
        """KI-Feinschliff (optional). Liefert *immer* ein Dict — niemals Code."""
        if not _finishing_enabled():
            return {'theme_id': spec.theme_id, 'source': 'off'}
        try:
            from .blocks_finishing import run_finishing
            return run_finishing(spec)
        except Exception:
            logger.exception('Bausteinmodus-Feinschliff übersprungen — fahre ohne KI fort.')
            return {'theme_id': spec.theme_id, 'source': 'error'}


# Re-export für saubere Importe von außen.
__all__ = ['FreeHtmlBlockBoardGenerationService']

# build_resource_context wird hier importiert nur für ggf. spätere Nutzung in finishing.
_ = build_resource_context
