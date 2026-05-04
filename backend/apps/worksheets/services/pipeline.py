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

    def run(self) -> Worksheet:
        self._resolve_pattern()
        self.page_setup = self.normalize_setup(self.payload.get('page_setup'))
        content = self._generate_with_provider()
        content = self._maybe_review(content)
        content, notes = self.repair(content, self.pattern, run_reflow=True)
        render_model = self.render(content, self.page_setup, self.pattern, self.payload)
        worksheet = self._persist(content, render_model)
        if notes:
            worksheet.content['validation_errors'] = notes
            worksheet.save(update_fields=['content'])
        return worksheet

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
        return {
            'request': self.payload,
            'page_setup': self.page_setup,
            'pattern': self.pattern.blueprint if self.pattern else {},
        }

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

    def _persist(self, content: dict, render_model: dict) -> Worksheet:
        return Worksheet.objects.create(
            owner=self.user,
            pattern=self.pattern,
            title=content.get('title', 'Arbeitsblatt'),
            subject=self.payload.get('subject_name') or self.payload.get('subject', ''),
            grade=self.payload.get('grade_value') or self.payload.get('grade'),
            topic=self.payload.get('topic', ''),
            page_setup=self.page_setup,
            content=content,
            render_model=render_model,
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
        # Kein Reflow: dieser Lauf ersetzt *eine* Seite — keine zusätzlichen Dokumentseiten.
        src, notes = self.repair(src, self.worksheet.pattern, run_reflow=False)
        self.attach_validation_errors(src, notes)
        render_model = self.render(
            src,
            self.worksheet.page_setup,
            self.worksheet.pattern,
            self._req_meta(),
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
