"""Class-based Worksheet-Pipelines.

Jede Pipeline kapselt einen mehrstufigen Workflow als Klasse mit klarer
``run()``-API. Das ersetzt freie Funktionen mit langen, verschachtelten
Bedingungen und macht die Pipelines erweiterbar (Vererbung statt Copy-Paste):

* :class:`WorksheetPipeline` — gemeinsame Hilfen (Provider, Normalisierung,
  Reparatur, Render-Modell).
* :class:`WorksheetGenerator` — kompletter Generierungs-Lauf inkl. Persistenz.
* :class:`PageRegenerator` — KI-Regenerierung **einer** Seite, Rest bleibt.

Public-API für den Rest des Codes:

>>> WorksheetGenerator(user, payload).run()
>>> content, render_model, notes = PageRegenerator(ws, idx, instr, body).run()
"""
from __future__ import annotations

import copy
import logging
from typing import Any, Iterable

from django.conf import settings

from apps.ai.providers.factory import get_provider
from apps.curricula.models import WorksheetCurriculumUsage
from apps.curricula.services.context_matching import CurriculumContextMatchingService
from apps.patterns.models import WorksheetPattern
from apps.patterns.services import PatternMatcher
from apps.worksheets.models import Worksheet
from apps.worksheets.owner import resolve_worksheet_owner

from .content_blocks import (
    apply_page_coalesce_to_content,
    apply_page_overflow_reflow,
    repair_incomplete_ai_blocks,
)
from .page import normalize_page_setup
from .render_model import build_render_model
from .validators import validate_and_repair

logger = logging.getLogger(__name__)


def _sanitize_curriculum_alignment(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}

    def slist(key: str) -> list[str]:
        v = raw.get(key)
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if x is not None and str(x).strip()][:30]

    return {
        'used_topic_area': str(raw.get('used_topic_area') or '').strip(),
        'used_subtopics': slist('used_subtopics'),
        'used_competency_goals': slist('used_competency_goals'),
        'used_task_types': slist('used_task_types'),
        'used_language_guidance': slist('used_language_guidance'),
        'notes': str(raw.get('notes') or '').strip()[:4000],
    }


class WorksheetPipeline:
    """Basis für KI-gestützte Worksheet-Workflows.

    Subklassen überschreiben :meth:`run`. Die Helfer in dieser Klasse sind
    bewusst klein und einzeln testbar; Subklassen orchestrieren sie nur.
    """

    def __init__(self) -> None:
        self.provider = get_provider()

    @staticmethod
    def normalize_setup(raw_setup: dict | None) -> dict:
        return normalize_page_setup(raw_setup or {})

    @staticmethod
    def repair(content: dict, pattern: WorksheetPattern | None, *, run_reflow: bool) -> tuple[dict, list[str]]:
        """Idempotente Validierungs- und Reparaturkette."""
        content, errors = validate_and_repair(content, pattern)
        content, repair_notes = repair_incomplete_ai_blocks(content)
        content, coalesce_notes = apply_page_coalesce_to_content(content)
        notes = list(errors) + repair_notes + coalesce_notes
        if run_reflow:
            content, reflow_notes = apply_page_overflow_reflow(content)
            notes.extend(reflow_notes)
        return content, notes

    @staticmethod
    def attach_validation_errors(content: dict, notes: Iterable[str]) -> None:
        notes_list = list(notes)
        if notes_list:
            content['validation_errors'] = notes_list
        elif 'validation_errors' in content:
            del content['validation_errors']

    @staticmethod
    def render(
        content: dict,
        page_setup: dict,
        pattern: WorksheetPattern | None,
        request_meta: dict[str, Any],
    ) -> dict:
        return build_render_model(content, page_setup, pattern, request_meta)


class WorksheetGenerator(WorksheetPipeline):
    """Generiert ein neues Worksheet: Pattern matchen, KI rufen, validieren, persistieren."""

    def __init__(self, user, payload: dict[str, Any]):
        super().__init__()
        self.user = resolve_worksheet_owner(user)
        self.payload = payload
        self.pattern: WorksheetPattern | None = None
        self.page_setup: dict = {}
        self._curriculum_bundle: dict[str, Any] | None = None
        self._matched_row: dict[str, Any] | None = None
        self._curriculum_warning: str | None = None

    def run(self) -> Worksheet:
        from apps.boards.services.pipeline_ai_meter import generation_meter_context

        self._resolve_pattern()
        self.page_setup = self.normalize_setup(self.payload.get('page_setup'))
        self._resolve_curriculum_match()
        with generation_meter_context(user=self.user) as meter:
            content = self._generate_with_provider()
            curriculum_alignment: dict[str, Any] = {}
            if isinstance(content, dict):
                curriculum_alignment = _sanitize_curriculum_alignment(content.pop('curriculum_alignment', None))
            content = self._maybe_review(content)
            if isinstance(content, dict):
                content.pop('curriculum_alignment', None)
            content, notes = self.repair(content, self.pattern, run_reflow=True)
            render_model = self.render(content, self.page_setup, self.pattern, self.payload)
            worksheet = self._persist(content, render_model, curriculum_alignment)
            meter.flush_logs_to_db(
                board=None,
                metadata_extra={'context': 'worksheet', 'worksheet_id': str(worksheet.pk)},
            )
        if notes:
            worksheet.content['validation_errors'] = notes
            worksheet.save(update_fields=['content'])
        return worksheet

    def _resolve_curriculum_match(self) -> None:
        self._curriculum_warning = None
        self._matched_row = None
        self._curriculum_bundle = None
        payload = self.payload
        state = (payload.get('federal_state') or payload.get('state') or '').strip()
        subject = (payload.get('subject_name') or payload.get('subject') or '').strip()
        grade_raw = payload.get('grade_value') if payload.get('grade_value') is not None else payload.get('grade')
        grade: int | None = None
        if grade_raw is not None:
            try:
                grade = int(grade_raw)
            except (TypeError, ValueError):
                grade = None
        topic = (payload.get('topic') or '').strip()
        if not state or not subject:
            self._curriculum_warning = (
                'Für dieses Arbeitsblatt wurde kein aktiver Lehrplan-Kontext gewählt '
                '(Bundesland oder Fach fehlt im Auftrag).'
            )
            return
        matches = CurriculumContextMatchingService.find_best_contexts(
            state=state,
            subject=subject,
            grade=grade,
            topic=topic,
            limit=5,
        )
        if not matches:
            self._curriculum_warning = 'Kein passender aktiver Lehrplan-Kontext gefunden.'
            return
        best = matches[0]
        ctx = best['context']
        if best['score'] <= 0:
            self._curriculum_warning = 'Kein passender aktiver Lehrplan-Kontext gefunden.'
            return
        self._matched_row = best
        self._curriculum_bundle = CurriculumContextMatchingService.compact_context_for_prompt(ctx)

    def _resolve_pattern(self) -> None:
        if self.payload.get('pattern_id'):
            self.pattern = WorksheetPattern.objects.get(id=self.payload['pattern_id'])
            return
        if self.payload.get('use_pattern_matching', True):
            matches = PatternMatcher().find_best(
                WorksheetPattern.objects.filter(status='active'),
                self.payload,
                1,
            )
            if matches:
                self.pattern = matches[0]['pattern']

    def _ai_payload(self) -> dict[str, Any]:
        pl: dict[str, Any] = {
            'request': self.payload,
            'page_setup': self.page_setup,
            'pattern': self.pattern.blueprint if self.pattern else {},
        }
        if self._curriculum_bundle:
            pl['curriculum_context'] = self._curriculum_bundle
        return pl

    def _generate_with_provider(self) -> dict:
        return self.provider.generate(self._ai_payload())

    def _maybe_review(self, content: dict) -> dict:
        if not getattr(settings, 'GEMINI_ENABLE_REVIEW_PASS', False):
            return content
        review = getattr(self.provider, 'review_worksheet', None)
        if not callable(review):
            return content
        try:
            reviewed = review(
                content,
                self.payload,
                self.page_setup,
                self.pattern.blueprint if self.pattern else {},
            )
        except Exception as exc:
            logger.warning(
                'Review-Durchgang fehlgeschlagen, es wird der Erstentwurf verwendet: %s',
                exc,
                exc_info=True,
            )
            return content
        return self._review_output_or_original(content, reviewed)

    @staticmethod
    def _review_output_or_original(original: dict, reviewed: object) -> dict:
        """Pflichtfelder prüfen; Seiten nur nach oben wachsen lassen (kein Löschen im Review)."""
        if not isinstance(reviewed, dict):
            logger.warning('Review verworfen: Antwort ist kein Objekt.')
            return original
        for key in ('title', 'pages', 'presentation', 'solutions'):
            if key not in reviewed:
                logger.warning('Review verworfen: Pflichtfeld %s fehlt.', key)
                return original
        o_pages = original.get('pages')
        r_pages = reviewed.get('pages')
        if not isinstance(o_pages, list) or not isinstance(r_pages, list):
            logger.warning('Review verworfen: pages nicht als Liste.')
            return original
        if len(r_pages) < 1:
            logger.warning('Review verworfen: pages leer.')
            return original
        if len(r_pages) < len(o_pages):
            logger.warning(
                'Review verworfen: weniger Seiten als im Erstentwurf (%s → %s) — keine Löschung erlaubt.',
                len(o_pages),
                len(r_pages),
            )
            return original
        max_extra = getattr(settings, 'GEMINI_REVIEW_MAX_EXTRA_PAGES', 10)
        if len(r_pages) - len(o_pages) > max_extra:
            logger.warning(
                'Review verworfen: zu viele Zusatzseiten (%s über Basis), max %s.',
                len(r_pages) - len(o_pages),
                max_extra,
            )
            return original
        if len(r_pages) != len(o_pages):
            logger.info(
                'Review: Seitenanzahl %s → %s (Anfügen am Ende laut Prompt erlaubt).',
                len(o_pages),
                len(r_pages),
            )
        return reviewed

    def _persist(self, content: dict, render_model: dict, curriculum_alignment: dict[str, Any]) -> Worksheet:
        meta: dict[str, Any] = {}
        if self._curriculum_warning:
            meta['curriculum_warning'] = self._curriculum_warning
        if self._matched_row:
            meta['used_curriculum_context_id'] = str(self._matched_row['context'].id)
        worksheet = Worksheet.objects.create(
            owner=self.user,
            pattern=self.pattern,
            title=content.get('title', 'Arbeitsblatt'),
            subject=self.payload.get('subject_name') or self.payload.get('subject', ''),
            grade=self.payload.get('grade_value') or self.payload.get('grade'),
            topic=self.payload.get('topic', ''),
            page_setup=self.page_setup,
            content=content,
            render_model=render_model,
            generation_meta=meta,
        )
        self._persist_curriculum_usage(worksheet, curriculum_alignment)
        return worksheet

    def _persist_curriculum_usage(self, worksheet: Worksheet, curriculum_alignment: dict[str, Any]) -> None:
        if not self._matched_row:
            return
        ctx = self._matched_row['context']
        snapshot = CurriculumContextMatchingService.compact_context_for_prompt(ctx)
        tv = CurriculumContextMatchingService.build_teacher_visible_usage(
            ctx,
            match_score=float(self._matched_row['score']),
            match_reasons=list(self._matched_row['reasons']),
            curriculum_alignment=curriculum_alignment,
        )
        alignment = curriculum_alignment if any(curriculum_alignment.values()) else {}
        if not alignment:
            alignment = {
                'used_topic_area': ctx.topic_area,
                'used_subtopics': list(ctx.subtopics or [])[:12],
                'used_competency_goals': list(ctx.competency_goals or [])[:12],
                'used_task_types': list(ctx.allowed_task_types or [])[:12],
                'used_language_guidance': [],
                'notes': 'Keine gesonderte KI-Begründung geliefert — Anzeige aus dem gewählten Lehrplan-Kontext.',
            }
        note = (
            'Die KI hat diesen Kontext als fachliche Leitplanke für Thema, Niveau, '
            'Aufgabenformate und Sprache genutzt (soweit im Prompt vorgegeben).'
        )
        WorksheetCurriculumUsage.objects.create(
            worksheet=worksheet,
            context=ctx,
            match_score=float(self._matched_row['score']),
            match_reasons=list(self._matched_row['reasons']),
            used_context_snapshot=snapshot,
            teacher_visible_summary=tv,
            ai_usage_note=note,
            curriculum_alignment=alignment,
        )


class PageRegenerator(WorksheetPipeline):
    """Erzeugt **eine** Seite neu, Rest des Worksheets bleibt unverändert."""

    def __init__(
        self,
        worksheet: Worksheet,
        page_index: int,
        teacher_instruction: str = '',
        content: dict | None = None,
    ):
        super().__init__()
        self.worksheet = worksheet
        self.page_index = page_index
        self.teacher_instruction = (teacher_instruction or '').strip()[:4000]
        self._initial_content = content

    def run(self) -> tuple[dict, dict, list[str]]:
        from apps.boards.services.pipeline_ai_meter import generation_meter_context

        with generation_meter_context(user=self.worksheet.owner) as meter:
            src = self._prepare_source()
            old_page = src['pages'][self.page_index]
            new_page = self.provider.regenerate_page(self._build_payload(src, old_page))
            blocks = new_page.get('blocks')
            if not isinstance(blocks, list) or len(blocks) == 0:
                raise ValueError('Die KI hat keine gültigen Blöcke für diese Seite geliefert')
            src['pages'][self.page_index] = {
                'page_label': str(
                    new_page.get('page_label')
                    if new_page.get('page_label') is not None
                    else old_page.get('page_label') or ''
                ),
                'blocks': blocks,
            }
            src, notes = self.repair(src, self.worksheet.pattern, run_reflow=False)
            self.attach_validation_errors(src, notes)
            render_model = self.render(
                src,
                self.worksheet.page_setup,
                self.worksheet.pattern,
                self._req_meta(),
            )
            meter.flush_logs_to_db(
                board=None,
                metadata_extra={
                    'context': 'worksheet_page_regenerate',
                    'worksheet_id': str(self.worksheet.pk),
                    'page_index': self.page_index,
                },
            )
        return src, render_model, notes

    def _prepare_source(self) -> dict:
        src = (
            copy.deepcopy(self._initial_content)
            if self._initial_content is not None
            else copy.deepcopy(self.worksheet.content)
        )
        if not isinstance(src, dict):
            raise ValueError('Ungültiger Arbeitsblatt-Inhalt')
        pages = src.get('pages')
        if not isinstance(pages, list) or self.page_index < 0 or self.page_index >= len(pages):
            raise ValueError('Ungültige Seitennummer')
        return src

    def _req_meta(self) -> dict[str, Any]:
        rm = self.worksheet.render_model or {}
        return {
            'theme': rm.get('theme', 'neutral'),
            'creativity': rm.get('creativity', 'balanced'),
        }

    def _build_payload(self, src: dict, old_page: dict) -> dict[str, Any]:
        return {
            'worksheet_meta': {
                'title': src.get('title'),
                'subtitle': src.get('subtitle'),
                'subject': self.worksheet.subject,
                'grade': self.worksheet.grade,
                'topic': self.worksheet.topic,
            },
            'page_index': self.page_index,
            'page_total': len(src['pages']),
            'current_page': old_page,
            'other_pages_summary': self._other_pages_summary(src['pages']),
            'teacher_instruction': self.teacher_instruction,
            'page_setup': self.normalize_setup(self.worksheet.page_setup),
            'presentation': src.get('presentation'),
        }

    def _other_pages_summary(self, pages: list[dict]) -> str:
        lines: list[str] = []
        for i, page in enumerate(pages):
            if i == self.page_index:
                continue
            blocks = page.get('blocks') or []
            titles = [str(b.get('title') or b.get('type') or '?') for b in blocks[:6]]
            lines.append(f'Seite {i + 1}: {len(blocks)} Blöcke — {", ".join(titles)}')
        return '\n'.join(lines) if lines else '(nur diese Seite im Dokument)'
