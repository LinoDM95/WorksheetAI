"""Smartboard-Kreativmodus — technischer Pfad ohne Design-Vorpipeline.

1. Ein Aufruf **Code-Generierung** (``generate_free_html_board``).
2. **Sanitize/Validate** + **KI-Reparatur** über ``run_validation_repairs``.
3. Nach **erfolgreicher** Validierung: optional **Visual-Polish** (zweiter LLM-Durchlauf,
   nur Oberflächendetails — abschaltbar über ``SMARTBOARD_ENABLE_VISUAL_POLISH_PASS``).
4. **Touch-Audit** (optional). Bei Fehlschlag: **ein** zusätzlicher Reparatur-LLM nur
   wenn ``SMARTBOARD_TOUCH_ONLY_REPAIR`` aktiv und Audit gelaufen ist *(Token-sparend)*.
5. **Quality-Report**.
6. Board persistieren + ``AIUsageLog``-Flush.

Optional: NDJSON-Stream mit kurzen deutschsprachigen Fortschrittshinweisen
(``SmartboardCreativePipeline.iter_ndjson`` / ``generate_board_stream``).
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable, Iterator

from django.conf import settings

from ..models import Board
from ..grade_bounds import resolve_board_grade_fields
from ..owner import resolve_board_owner
from .board_revision_head import create_initial_revision_if_absent
from .free_html_generation import (
    FreeHtmlBoardGenerationService,
    _select_provider,
    board_didactic_from_generation_payload,
    resolve_board_title_from_generation,
)
from .free_html_prompt_context import build_resource_context
from .free_html_sanitize import validate_free_html_bundle
from .free_html_validate_repair import run_validation_repairs
from .free_html_visual_polish import run_visual_polish_pass
from .quality_report import build_quality_report
from .touch_audit import TouchAuditService
from .visual_resource_registry import (
    filter_used_assets,
    filter_used_datasets,
    filter_used_libraries,
)

logger = logging.getLogger(__name__)

DBG_PREFIX_BOARD = '[SmartboardPipeline]'


def _dbg(message: str) -> None:
    logger.debug('%s %s', DBG_PREFIX_BOARD, message)


LABEL_CODEGEN = 'Die KI erstellt dein interaktives Board …'
LABEL_VALIDATE = 'Wir prüfen den Code auf Sicherheit und Struktur …'
LABEL_POLISH = 'Wir verfeinern Farben und Oberflächendetails …'
LABEL_TOUCH = 'Wir prüfen die Bedienung für Smartboard und Touch …'
LABEL_TOUCH_FIX = 'Wir optimieren Bedienflächen und Abstände …'
LABEL_QUALITY = 'Kurzer Qualitätscheck …'
LABEL_SAVE = 'Fast fertig — wir speichern …'

PCT_CODEGEN = 12
PCT_VALIDATE = 32
PCT_POLISH = 46
PCT_TOUCH = 62
PCT_TOUCH_FIX = 78
PCT_QUALITY = 88
PCT_SAVE = 96


def _structural_error_count(raw: dict[str, Any]) -> int:
    bundle = FreeHtmlBoardGenerationService.sanitize_payload(raw if isinstance(raw, dict) else {})
    _, errs, _ = validate_free_html_bundle(bundle)
    return len(errs)


def _touch_issues_as_validation_errors(touch_audit: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for issue in touch_audit.get('issues') or []:
        if not isinstance(issue, dict):
            continue
        if issue.get('severity') != 'error':
            continue
        typ = str(issue.get('type') or '').strip()
        msg = str(issue.get('message') or '').strip()
        if not msg:
            continue
        tag = f'[Touch] ({typ})' if typ else '[Touch]'
        line = f'{tag} {msg}'
        if len(line) > 600:
            line = line[:597] + '…'
        out.append(line)
    return out[:24]


def _visual_errors(verrs: list[str]) -> list[str]:
    return [e for e in verrs if str(e).startswith('[Visuell]')]


def _merge_verrs_after_touch(
    structural_errs: list[str],
    prior_verrs: list[str],
) -> list[str]:
    vis = _visual_errors(prior_verrs)
    return list(structural_errs) + vis


def _visual_qa_for_validate() -> bool:
    if not getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True):
        return False
    return bool(getattr(settings, 'SMARTBOARD_ENABLE_BROWSER_SMOKE_TEST', True))


class SmartboardCreativePipeline:
    """Technischer Orchestrator für die Board-Erstellung."""

    def __init__(self, user, payload: dict) -> None:
        self.user = resolve_board_owner(user)
        self.payload = payload or {}

    def generate(self) -> Board:
        from .pipeline_ai_meter import generation_meter_context

        with generation_meter_context(user=self.user) as meter:
            _dbg('[AIUsage] Pipeline-Meter aktiv (technischer Pfad).')
            board: Board | None = None
            for kind, data in self._iter_pipeline():
                if kind == 'board':
                    board = data
            if board is None:
                raise RuntimeError('SmartboardCreativePipeline: kein Board erzeugt')
            meter.flush_logs_to_board(board)
            create_initial_revision_if_absent(board, user=self.user, prompt='(Erstgenerierung)')
            return board

    def iter_ndjson(self, *, serialize_board: Callable[[Board], dict]) -> Iterator[bytes]:
        from .pipeline_ai_meter import generation_meter_context

        def enc(obj: dict[str, Any]) -> bytes:
            return (json.dumps(obj, ensure_ascii=False) + '\n').encode('utf-8')

        with generation_meter_context(user=self.user) as meter:
            board: Board | None = None
            for kind, data in self._iter_pipeline():
                if kind == 'phase':
                    yield enc(data)
                elif kind == 'board':
                    board = data
            if board is None:
                raise RuntimeError('SmartboardCreativePipeline: kein Board erzeugt')
            meter.flush_logs_to_board(board)
            create_initial_revision_if_absent(board, user=self.user, prompt='(Erstgenerierung)')
            yield enc({'event': 'done', 'board': serialize_board(board)})

    def _iter_pipeline(self) -> Iterator[tuple[str, Any]]:
        topic = (self.payload.get('topic') or self.payload.get('prompt') or '')[:80]
        _dbg(f'Start technical pipeline topic/prompt~{topic!r}...')

        yield (
            'phase',
            {'event': 'phase', 'key': 'codegen', 'pct': PCT_CODEGEN, 'label': LABEL_CODEGEN},
        )

        ai_quality_tier = self.payload.get('ai_quality_tier')
        provider = _select_provider(
            ai_quality_tier=ai_quality_tier.strip().lower() if isinstance(ai_quality_tier, str) else None,
        )
        ai_payload = self._build_technical_ai_payload()
        provider_name = type(provider).__name__
        _dbg(f'LLM codegen: provider={provider_name!r}')
        try:
            raw = provider.generate_free_html_board(ai_payload)
        except Exception:
            logger.exception('SmartboardCreativePipeline: Generierung beim Provider fehlgeschlagen')
            raise
        if not isinstance(raw, dict):
            raw = {}
        _dbg(f'Codegen Antwort keys={list(raw.keys())!s} title={raw.get("title")!r}')

        ctx = build_resource_context()
        context_hint = (
            f'Fach: {self.payload.get("subject") or "—"}\n'
            f'Thema: {self.payload.get("topic") or "—"}\n'
            f'Auftrag: {str(self.payload.get("prompt") or "")[:500]}'
        )
        visual_qa_enabled = _visual_qa_for_validate()

        yield (
            'phase',
            {'event': 'phase', 'key': 'validate', 'pct': PCT_VALIDATE, 'label': LABEL_VALIDATE},
        )

        last_raw, bundle, ok, verrs, vwarns, repair_trace = run_validation_repairs(
            provider,
            initial_raw=raw,
            resource_ctx=ctx,
            context_hint=context_hint,
            board_didactic=board_didactic_from_generation_payload(self.payload),
            visual_qa=visual_qa_enabled,
            document_base_href=None,
        )
        repair_trace = list(repair_trace)
        _dbg(
            f'Validate/Repair: ok={ok} errors={len(verrs)} warnings={len(vwarns)} '
            f'visual_qa={visual_qa_enabled} repair_steps={len(repair_trace)}',
        )

        if ok:
            yield (
                'phase',
                {'event': 'phase', 'key': 'polish', 'pct': PCT_POLISH, 'label': LABEL_POLISH},
            )
            last_raw, bundle, polish_trace = run_visual_polish_pass(
                provider,
                bundle=bundle,
                last_raw=last_raw,
                resource_ctx=ctx,
                context_hint=context_hint,
                board_didactic=board_didactic_from_generation_payload(self.payload),
                style_dna={},
                visual_qa=visual_qa_enabled,
                document_base_href=None,
            )
            repair_trace.append(polish_trace)

        yield (
            'phase',
            {'event': 'phase', 'key': 'touch', 'pct': PCT_TOUCH, 'label': LABEL_TOUCH},
        )

        touch_audit_result: dict[str, Any] = {}
        if getattr(settings, 'SMARTBOARD_ENABLE_TOUCH_AUDIT', True):
            try:
                touch_audit_result = TouchAuditService(style_dna={}).run(bundle)
            except Exception:  # noqa: BLE001
                logger.exception('Pipeline: TouchAudit fehlgeschlagen')
                _dbg('TouchAudit: FEHLER (siehe Log).')
        else:
            touch_audit_result = {'ran': False, 'passed': True, 'issues': []}

        touch_repair_enabled = bool(getattr(settings, 'SMARTBOARD_TOUCH_ONLY_REPAIR', True))
        if (
            touch_repair_enabled
            and touch_audit_result.get('ran')
            and not touch_audit_result.get('passed', True)
        ):
            t_errs = _touch_issues_as_validation_errors(touch_audit_result)
            if t_errs:
                yield (
                    'phase',
                    {
                        'event': 'phase',
                        'key': 'touch_fix',
                        'pct': PCT_TOUCH_FIX,
                        'label': LABEL_TOUCH_FIX,
                    },
                )
                baseline_struct = _structural_error_count(last_raw)
                vis_snap = _visual_errors(verrs)
                hint_touch = (
                    f'{context_hint}\n\n'
                    '[Touch-Reparatur] Nur Smartboard-/Touch-Tauglichkeit verbessern '
                    '(mindestens Mindestgrößen, Abstände, Pointer-Events). '
                    'Keine inhaltlichen oder didaktischen Umbauten.'
                )
                payload = {
                    **ctx,
                    'html': bundle.get('html') or '',
                    'css': bundle.get('css') or '',
                    'javascript': bundle.get('javascript') or '',
                    'teacher_notes': bundle.get('teacher_notes') or '',
                    'usage_instructions': list(bundle.get('usage_instructions') or []),
                    'warnings': list(bundle.get('warnings') or []),
                    'used_libraries': list(bundle.get('used_libraries') or []),
                    'used_assets': list(bundle.get('used_assets') or []),
                    'used_datasets': list(bundle.get('used_datasets') or []),
                    'validation_errors': t_errs,
                    'repair_attempt': 1,
                    'repair_attempt_max': 1,
                    'context_hint': hint_touch,
                }
                repaired: dict[str, Any] = {}
                try:
                    repaired = provider.repair_free_html_board(payload) or {}
                except Exception:
                    logger.exception('Pipeline: Touch-Reparatur beim Provider fehlgeschlagen')
                    repair_trace.append({'round': 'touch_repair', 'ok': False, 'error': 'provider_exception'})
                if isinstance(repaired, dict) and repaired:
                    last_candidate = {
                        **last_raw,
                        **{k: v for k, v in repaired.items() if v is not None},
                    }
                    after_struct = _structural_error_count(last_candidate)
                    if after_struct <= baseline_struct:
                        last_raw = last_candidate
                        bundle = FreeHtmlBoardGenerationService.sanitize_payload(last_candidate)
                        _, s_errs_new, w_new = validate_free_html_bundle(bundle)
                        verrs = _merge_verrs_after_touch(s_errs_new, verrs)
                        merged_warns = list(vwarns) + list(w_new)
                        vwarns = list(dict.fromkeys(merged_warns))
                        repair_trace.append({
                            'round': 'touch_repair',
                            'ok': True,
                            'structural_before': baseline_struct,
                            'structural_after': after_struct,
                            'accepted': True,
                            'visual_preserved': bool(vis_snap),
                        })
                        try:
                            touch_audit_result = TouchAuditService(style_dna={}).run(bundle)
                        except Exception:  # noqa: BLE001
                            logger.exception('Pipeline: Touch-Reaudit fehlgeschlagen')
                    else:
                        repair_trace.append({
                            'round': 'touch_repair',
                            'ok': False,
                            'reason': 'rollback_structural_worse',
                            'structural_before': baseline_struct,
                            'structural_after': after_struct,
                        })

        yield (
            'phase',
            {'event': 'phase', 'key': 'quality', 'pct': PCT_QUALITY, 'label': LABEL_QUALITY},
        )

        quality_report = build_quality_report(
            validation_errors=verrs,
            validation_warnings=vwarns,
            browser_test_result={'ran': visual_qa_enabled, 'errors': [], 'warnings': []},
            touch_audit_result=touch_audit_result,
            screenshot_quality_result=None,
            repair_history=repair_trace,
            risk_analysis={},
            style_dna={},
        )

        title = resolve_board_title_from_generation(self.payload, last_raw=last_raw, initial_raw=raw)
        desc = str(last_raw.get('description') or raw.get('description') or '')[:5000]

        gf, gt, g_label = resolve_board_grade_fields(self.payload)

        gen_input = self._sanitized_input()
        gen_input['validation_repair_trace'] = repair_trace
        gen_input['visual_qa_pipeline'] = 'on' if visual_qa_enabled else 'off'
        gen_input['pipeline'] = 'technical'

        used_libs = filter_used_libraries(bundle.get('used_libraries'))
        used_assets = filter_used_assets(bundle.get('used_assets'))
        used_datasets = filter_used_datasets(bundle.get('used_datasets'))

        large = getattr(settings, 'SMARTBOARD_LARGE_MODEL', '') or ''
        small = getattr(settings, 'SMARTBOARD_SMALL_MODEL', '') or ''

        yield (
            'phase',
            {'event': 'phase', 'key': 'save', 'pct': PCT_SAVE, 'label': LABEL_SAVE},
        )

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
            used_libraries=used_libs,
            used_assets=used_assets,
            used_datasets=used_datasets,
            generation_prompt=str(self.payload.get('prompt') or '')[:8000],
            generation_input=gen_input,
            ai_raw_output=last_raw,
            validation_errors=verrs,
            validation_warnings=vwarns,
            creative_brief={},
            style_dna={},
            intent_analysis={},
            risk_analysis={},
            quality_report=quality_report,
            browser_test_result={'ran': visual_qa_enabled},
            touch_audit_result=touch_audit_result,
            screenshot_quality_result={},
            repair_history=[],
            used_model_config={
                'small_model': small,
                'large_model': large,
                'pipeline': 'technical',
                'used_pipeline': True,
                'asset_engine': False,
            },
            assets_summary={},
        )
        _dbg(
            f'Fertig board_id={board.pk} status={board.status!r} '
            f'validation_errors={len(board.validation_errors or [])}',
        )
        yield ('board', board)

    def _build_technical_ai_payload(self) -> dict[str, Any]:
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
            'intent': {},
            'risk': {},
            'creative_brief': {},
            'style_dna': {},
            'snippets': [],
            'golden_example': '',
            'asset_pack_summary': {},
        }

    def _sanitized_input(self) -> dict:
        keep = (
            'prompt', 'subject', 'grade', 'grade_from', 'grade_to', 'topic', 'title', 'board_type',
            'duration_minutes',
            'creativity', 'visual_style', 'target_device', 'ai_quality_tier',
        )
        base = {k: self.payload.get(k) for k in keep if k in self.payload}
        return base


def use_pipeline_enabled() -> bool:
    return bool(getattr(settings, 'SMARTBOARD_USE_PIPELINE', True))


def generate_with_fallback(user, payload: dict) -> Board:
    if use_pipeline_enabled():
        return SmartboardCreativePipeline(user, payload).generate()
    return FreeHtmlBoardGenerationService(user, payload).run()


def generate_board_stream(
    *,
    user,
    payload: dict,
    serialize_board: Callable[[Board], dict],
) -> Iterator[bytes]:
    if use_pipeline_enabled():
        yield from SmartboardCreativePipeline(user, payload).iter_ndjson(serialize_board=serialize_board)
    else:
        yield from FreeHtmlBoardGenerationService(user, payload).iter_ndjson(serialize_board=serialize_board)
