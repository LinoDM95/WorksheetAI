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
from .creative_html_pipeline import (
    RENDER_KIND_CREATIVE_HTML,
    build_creative_html_render_model,
    is_creative_html_content,
    repair_creative_html_worksheet,
    worksheet_pages_are_creative_html_shape,
)
from .page import normalize_page_setup
from .render_model import build_render_model
from .validators import validate_and_repair

logger = logging.getLogger(__name__)


def _payload_bool(payload: dict[str, Any], key: str, *, default: bool = True) -> bool:
    if key not in payload:
        return default
    v = payload.get(key)
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)) and v in (0, 1):
        return bool(v)
    s = str(v).strip().lower()
    if s in ('0', 'false', 'no', 'off'):
        return False
    if s in ('1', 'true', 'yes', 'on'):
        return True
    return default


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
    def repair(
        content: dict,
        pattern: WorksheetPattern | None,
        *,
        run_reflow: bool,
        run_coalesce: bool = True,
        page_setup: dict | None = None,
    ) -> tuple[dict, list[str]]:
        """Idempotente Validierungs- und Reparaturkette.

        ``run_coalesce``: Standard True — schlecht ausgelastete Doppel-/Dreifachseiten werden
        zusammengeführt. Beim Single-Page-Regenerate auf False setzen, damit eine bewusst
        gewählte Seitenzahl der Lehrkraft erhalten bleibt.
        """
        content, errors = validate_and_repair(content, pattern)
        content, repair_notes = repair_incomplete_ai_blocks(content)
        notes = list(errors) + repair_notes
        if run_coalesce:
            content, coalesce_notes = apply_page_coalesce_to_content(content, page_setup=page_setup)
            notes.extend(coalesce_notes)
        if run_reflow:
            content, reflow_notes = apply_page_overflow_reflow(content, page_setup=page_setup)
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
        creative_mode = (self.payload.get('worksheet_mode') or '').strip().lower() == 'creative'
        raw_ps: dict[str, Any] = dict(self.payload.get('page_setup') or {})
        if creative_mode:
            # Standard Kreativ-Modus: kein App-Header — die Seite endet am Footer (mit Seitenzahl),
            # der Inhalt nutzt die volle Höhe darüber. Frontend-Toggle kann das überschreiben.
            raw_ps['line_budget_include_app_header'] = _payload_bool(
                self.payload,
                'creative_show_sheet_header',
                default=False,
            )
        self.page_setup = self.normalize_setup(raw_ps)
        self._resolve_curriculum_match()
        with generation_meter_context(user=self.user) as meter:
            content = self._generate_with_provider()
            curriculum_alignment: dict[str, Any] = {}
            if isinstance(content, dict):
                curriculum_alignment = _sanitize_curriculum_alignment(content.pop('curriculum_alignment', None))
            creative = creative_mode
            if creative:
                if isinstance(content, dict):
                    content.pop('curriculum_alignment', None)
                content, notes = repair_creative_html_worksheet(
                    content if isinstance(content, dict) else {},
                    self.page_setup,
                )
            else:
                content = self._maybe_review(content)
                if isinstance(content, dict):
                    content.pop('curriculum_alignment', None)
                content, notes = self.repair(content, self.pattern, run_reflow=True, page_setup=self.page_setup)
            self.apply_inbox_listing_defaults(content, self.payload)
            if creative:
                render_model = build_creative_html_render_model(content, self.page_setup, self.payload)
            else:
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

    @staticmethod
    def apply_inbox_listing_defaults(content: dict[str, Any], payload: dict[str, Any]) -> None:
        """Neue KI-Blätter: leeres Listen-Fach (Ohne Ordner), Fach als Dokument-Untertitel.

        ``Worksheet.subject`` bleibt leer, damit die Explorer-Gruppierung mit Boards parity hat.
        Sichtbares Fach kommt aus ``content['subtitle']`` (Render-Modell), ggf. aus dem Auftrag.
        """
        if not isinstance(content, dict):
            return
        payload_subj = (payload.get('subject_name') or payload.get('subject') or '').strip()
        if payload_subj and not (content.get('subtitle') or '').strip():
            content['subtitle'] = payload_subj

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
        if (self.payload.get('worksheet_mode') or '').strip().lower() == 'creative':
            self.pattern = None
            return
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
        tb = self.payload.get('time_budget_minutes')
        if tb is not None:
            try:
                tbi = int(tb)
                if tbi > 0:
                    meta['time_budget_minutes'] = tbi
            except (TypeError, ValueError):
                pass
        worksheet = Worksheet.objects.create(
            owner=self.user,
            pattern=self.pattern,
            title=content.get('title', 'Arbeitsblatt'),
            subject='',
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
            creative = is_creative_html_content(src) or worksheet_pages_are_creative_html_shape(src)
            payload = self._build_payload(src, old_page, creative=creative)
            new_page = self.provider.regenerate_page(payload)
            if creative:
                html = new_page.get('html')
                if not isinstance(html, str) or not html.strip():
                    raise ValueError('Die KI hat kein gültiges HTML für diese Seite geliefert')
                src['pages'][self.page_index] = {
                    'page_label': str(
                        new_page.get('page_label')
                        if new_page.get('page_label') is not None
                        else old_page.get('page_label') or ''
                    ),
                    'html': html,
                    'page_css': str(new_page.get('page_css') if new_page.get('page_css') is not None else old_page.get('page_css') or ''),
                }
                src, notes = repair_creative_html_worksheet(src, self.normalize_setup(self.worksheet.page_setup))
            else:
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
                src, notes = self.repair(
                    src,
                    self.worksheet.pattern,
                    run_reflow=False,
                    run_coalesce=False,
                    page_setup=self.worksheet.page_setup,
                )
            self.attach_validation_errors(src, notes)
            if creative:
                render_model = build_creative_html_render_model(
                    src, self.worksheet.page_setup, self._req_meta()
                )
            else:
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
            'show_sheet_header': rm.get('show_sheet_header', True),
        }

    def _build_payload(self, src: dict, old_page: dict, *, creative: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {
            'worksheet_meta': {
                'title': src.get('title'),
                'subtitle': src.get('subtitle'),
                'subject': self.worksheet.subject,
                'grade': self.worksheet.grade,
                'topic': self.worksheet.topic,
                'show_sheet_header': (self.worksheet.render_model or {}).get('show_sheet_header', True),
            },
            'page_index': self.page_index,
            'page_total': len(src['pages']),
            'current_page': old_page,
            'other_pages_summary': self._other_pages_summary(src['pages'], creative=creative),
            'teacher_instruction': self.teacher_instruction,
            'page_setup': self.normalize_setup(self.worksheet.page_setup),
            'presentation': src.get('presentation'),
        }
        if creative:
            payload['worksheet_render_kind'] = RENDER_KIND_CREATIVE_HTML
            payload['other_pages_style_reference'] = self._other_pages_style_reference(
                pages=src['pages'],
            )
        return payload

    @staticmethod
    def _creative_sibling_html_excerpt(html: str, *, max_chars: int) -> str:
        """Kompakte Vorschau: Anfang + Ende, damit Motive (z. B. Grafiken) nicht nur im Mittelteil fehlen."""
        collapsed = ' '.join((html or '').replace('\n', ' ').split())
        if len(collapsed) <= max_chars:
            return collapsed or '(leer)'
        half = (max_chars - 3) // 2
        return f'{collapsed[:half]} … {collapsed[-half:]}'

    def _other_pages_style_reference(self, pages: list[dict]) -> str:
        """Volles page_css je Schwesterseite + HTML-Auszug — für konsistenten Illustrations-/UI-Stil beim Regenerieren."""
        parts: list[str] = []
        budget_left = 28_000
        per_css_cap = 7_500
        per_html_cap = 2_600
        for i, page in enumerate(pages):
            if i == self.page_index:
                continue
            if not isinstance(page, dict):
                continue
            if not (page.get('html') and not page.get('blocks')):
                continue
            label = str(page.get('page_label') or '').strip()
            css = str(page.get('page_css') or '').strip()
            if len(css) > per_css_cap:
                css = f'{css[:per_css_cap]}\n/* … gekürzt … */'
            raw_html = str(page.get('html') or '')
            ex = self._creative_sibling_html_excerpt(raw_html, max_chars=per_html_cap)
            block = (
                f'### Schwesterseite {i + 1}' + (f' — „{label}“' if label else '')
                + '\n\n**page_css (verbindliche Stil-Cues: Variablen, Farben, Typo — nicht ignorieren):**\n'
                + f'```css\n{(css if css.strip() else "(kein page_css)")}\n```\n\n'
                + '**HTML-Auszug (nur Stil-/Illustrations-Sprache ableiten — Inhalt dieser Seite nicht übernehmen):**\n'
                + f'```html\n{ex}\n```'
            )
            if len(block) > budget_left:
                block = (
                    block[: max(120, budget_left - 48)].rstrip()
                    + '\n…\n**(Abschnitt wegen Kontextgrenze gekürzt.)**'
                )
            parts.append(block)
            budget_left -= len(block) + 2
            if budget_left < 600:
                if i < len(pages) - 1:
                    parts.append('*(Weitere Schwesterseiten ausgelassen — Kontextbudget.)*')
                break
        return '\n\n'.join(parts) if parts else ''

    def _other_pages_summary(self, pages: list[dict], *, creative: bool = False) -> str:
        lines: list[str] = []
        for i, page in enumerate(pages):
            if i == self.page_index:
                continue
            if not isinstance(page, dict):
                continue
            if creative or ('html' in page and not page.get('blocks')):
                label = str(page.get('page_label') or '').strip()
                raw = str(page.get('html') or '')
                if creative:
                    snippet = self._creative_sibling_html_excerpt(raw, max_chars=900)
                else:
                    collapsed = ' '.join(raw.replace('\n', ' ').split())
                    snippet = collapsed[:180] + ('…' if len(collapsed) > 180 else '')
                lines.append(
                    f'Seite {i + 1}: {label + " — " if label else ""}{snippet or "(leer)"}'
                )
            else:
                blocks = page.get('blocks') or []
                titles = [str(b.get('title') or b.get('type') or '?') for b in blocks[:6]]
                lines.append(f'Seite {i + 1}: {len(blocks)} Blöcke — {", ".join(titles)}')
        return '\n'.join(lines) if lines else '(nur diese Seite im Dokument)'
