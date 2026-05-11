"""ScreenshotQualityJudge — strukturierte Bewertung der visuellen Qualität.

**MVP / structured-only**: Wir nehmen via Playwright (falls verfügbar) einen
Screenshot auf, sammeln Layoutmetriken (Anzahl Bedienelemente, Textdichte,
Aspect-Ratio-Compliance) und schicken **diese Metriken** an das kleine Modell.
Die Bewertung passiert text-basiert. Der Vision-/Multimodal-Pfad ist als
TODO-Hook markiert (siehe :py:meth:`ScreenshotQualityJudge._evaluate_with_vision`).

Wenn Playwright fehlt: ``ran=False`` mit neutralem Score und Warnung.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from uuid import uuid4

from django.conf import settings

from apps.ai.prompt_loader import build_screenshot_judge_prompt

from .ai_model_router import SmartboardAIModelRouter
from .free_html_visual_doc import build_visual_qa_document
from .free_html_visual_qa import (
    default_visual_qa_document_base,
    load_board_datasets_for_qa,
    visual_qa_playwright_available,
)
from .visual_resource_registry import filter_used_libraries

logger = logging.getLogger(__name__)


_LAYOUT_METRICS_JS = r"""
() => {
  const root = document.getElementById('board-root') || document.querySelector('.free-board');
  if (!root) return null;
  const sel = 'button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [role="slider"], .touch-target';
  const interactive = Array.from(root.querySelectorAll(sel)).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  });
  const all = root.querySelectorAll('*');
  const text = (root.innerText || '').trim();
  const mediaEls = Array.from(
    root.querySelectorAll('img, canvas, svg, video'),
  ).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  });
  const rootRect = root.getBoundingClientRect();
  const aspect = rootRect.height ? rootRect.width / rootRect.height : 0;
  let avgBtnArea = 0;
  if (interactive.length) {
    let s = 0;
    for (const el of interactive) {
      const r = el.getBoundingClientRect();
      s += r.width * r.height;
    }
    avgBtnArea = Math.round(s / interactive.length);
  }
  return {
    element_count: all.length,
    visible_media_count: mediaEls.length,
    interactive_count: interactive.length,
    average_button_area_px2: avgBtnArea,
    text_char_count: text.length,
    word_count: (text.match(/\S+/g) || []).length,
    aspect_ratio: Number.isFinite(aspect) ? Math.round(aspect * 100) / 100 : 0,
    width: Math.round(rootRect.width),
    height: Math.round(rootRect.height),
  };
}
"""


def _media_root() -> Path:
    base = Path(getattr(settings, 'MEDIA_ROOT', '.'))
    return base / 'board_screenshots'


def _heuristic_scores(metrics: dict, dna: dict) -> dict:
    """Wenn kein Modell antwortet: Scores aus Metriken ableiten."""
    interactive = int(metrics.get('interactive_count') or 0)
    avg_btn = float(metrics.get('average_button_area_px2') or 0)
    text = int(metrics.get('text_char_count') or 0)
    elements = int(metrics.get('element_count') or 0)

    age = (dna.get('age_style') or '').lower()
    target_btn = 64 * 64 if age in ('primary', 'kindergarten') else 56 * 56

    not_overloaded = 10 if elements < 80 else 8 if elements < 150 else 6 if elements < 250 else 4
    smartboard_fit = (
        10 if avg_btn >= target_btn else 8 if avg_btn >= target_btn * 0.7 else 6 if avg_btn >= target_btn * 0.4 else 4
    )
    readability = 9 if text < 800 else 7 if text < 1500 else 5
    visual_hierarchy = 7  # ohne Bildanalyse Default
    age_fit = (
        9 if age == 'primary' and interactive <= 6
        else 8 if age == 'secondary' and 2 <= interactive <= 12
        else 8 if age == 'adult' and interactive >= 1
        else 6
    )
    visual_quality = 7
    overall = round((readability + visual_hierarchy + smartboard_fit + age_fit + visual_quality + not_overloaded) * 100 / 60)
    return {
        'overall_score': overall,
        'scores': {
            'readability': readability,
            'visual_hierarchy': visual_hierarchy,
            'smartboard_fit': smartboard_fit,
            'age_fit': age_fit,
            'visual_quality': visual_quality,
            'not_overloaded': not_overloaded,
        },
        'issues': [],
        'repair_suggestions': [],
        '_source': 'heuristic',
    }


def _take_screenshot_and_metrics(bundle: dict, *, document_base_href: str, board_id: str | None) -> tuple[Path | None, dict]:
    used_libs = filter_used_libraries(bundle.get('used_libraries'))
    used_ds = bundle.get('used_datasets') or []
    datasets_obj = load_board_datasets_for_qa(used_ds if isinstance(used_ds, list) else [])
    doc = build_visual_qa_document(
        html=str(bundle.get('html') or ''),
        css=str(bundle.get('css') or ''),
        javascript=str(bundle.get('javascript') or ''),
        used_libraries=used_libs,
        board_datasets=datasets_obj,
        document_base_href=document_base_href,
        scripts_enabled=True,
    )
    target_dir = _media_root()
    target_dir.mkdir(parents=True, exist_ok=True)
    file_name = f'{board_id or uuid4().hex}.png'
    target = target_dir / file_name

    from playwright.sync_api import sync_playwright

    metrics: dict[str, Any] = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={'width': 1280, 'height': 720})
            page.set_content(doc, wait_until='load', timeout=90_000)
            page.wait_for_timeout(700)
            try:
                page.screenshot(path=str(target), full_page=False)
            except Exception:  # noqa: BLE001 — Screenshot nicht kritisch
                logger.warning('ScreenshotJudge: Screenshot konnte nicht gespeichert werden.')
                target = None
            try:
                metrics = page.evaluate(_LAYOUT_METRICS_JS) or {}
            except Exception:  # noqa: BLE001
                logger.exception('ScreenshotJudge: Metrik-evaluate fehlgeschlagen.')
                metrics = {}
        finally:
            browser.close()
    return target, metrics if isinstance(metrics, dict) else {}


def capture_board_stage_visuals(bundle: dict, *, board_id: str | None = None) -> tuple[Path | None, dict]:
    """Öffentliche Hilfsfunktion: gleicher Playwright-Pfad wie Screenshot-Judge (Metriken + PNG)."""
    href = default_visual_qa_document_base()
    if not href or not getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True):
        return None, {}
    if not visual_qa_playwright_available():
        return None, {}
    return _take_screenshot_and_metrics(bundle, document_base_href=href, board_id=board_id)


_JUDGE_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'overall_score': {'type': 'INTEGER'},
        'scores': {
            'type': 'OBJECT',
            'properties': {
                'readability': {'type': 'INTEGER'},
                'visual_hierarchy': {'type': 'INTEGER'},
                'smartboard_fit': {'type': 'INTEGER'},
                'age_fit': {'type': 'INTEGER'},
                'visual_quality': {'type': 'INTEGER'},
                'not_overloaded': {'type': 'INTEGER'},
            },
        },
        'issues': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'repair_suggestions': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
    },
}


class ScreenshotQualityJudge:
    """Pipeline-Schritt: bewertet das Board strukturiert (Vision-Pfad als TODO).

    Vision-Pfad: ``_evaluate_with_vision`` ist ein dokumentierter Hook und nutzt
    Gemini Multimodal mit dem PNG. Aktuell deaktiviert via Setting
    ``SMARTBOARD_ENABLE_VISION_JUDGE`` (Default ``False``).
    """

    def __init__(self, *, router: SmartboardAIModelRouter | None = None,
                 style_dna: dict | None = None, board_meta: dict | None = None) -> None:
        self._router = router
        self._dna = style_dna or {}
        self._meta = board_meta or {}

    def run(self, bundle: dict, *, board_id: str | None = None) -> dict[str, Any]:
        if not getattr(settings, 'SMARTBOARD_ENABLE_SCREENSHOT_JUDGE', True):
            return {'ran': False, 'reason': 'disabled by setting', 'overall_score': 0,
                    'scores': {}, 'issues': [], 'repair_suggestions': []}
        if not getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True) or not visual_qa_playwright_available():
            return {'ran': False, 'reason': 'playwright unavailable', 'overall_score': 0,
                    'scores': {}, 'issues': [], 'repair_suggestions': [],
                    'warnings': ['Screenshot-Judge benötigt Playwright + Chromium.']}
        href = default_visual_qa_document_base()
        if not href:
            return {'ran': False, 'reason': 'no document base', 'overall_score': 0,
                    'scores': {}, 'issues': [], 'repair_suggestions': []}

        try:
            screenshot_path, metrics = _take_screenshot_and_metrics(
                bundle, document_base_href=href, board_id=board_id,
            )
        except Exception:  # noqa: BLE001 — Pipeline darf nicht crashen
            logger.exception('ScreenshotJudge: Render-Fehler')
            return {'ran': False, 'reason': 'render failed', 'overall_score': 0,
                    'scores': {}, 'issues': [], 'repair_suggestions': []}

        # Vision-Pfad (TODO): Setting deaktiviert die Aktivierung.
        if getattr(settings, 'SMARTBOARD_ENABLE_VISION_JUDGE', False) and screenshot_path is not None:
            vision = self._evaluate_with_vision(screenshot_path, metrics)
            if vision is not None:
                vision.update({'ran': True, 'mode': 'vision',
                               'screenshot_path': str(screenshot_path),
                               'metrics': metrics})
                return vision

        # Strukturierte Bewertung über kleines Modell
        fallback = _heuristic_scores(metrics, self._dna)
        from .board_stage_blank_check import analyze_blank_stage

        blank_stage = analyze_blank_stage(
            layout_metrics=metrics,
            screenshot_path=screenshot_path,
        )
        if self._router is None:
            base = {**fallback, 'ran': True, 'mode': 'heuristic',
                    'screenshot_path': str(screenshot_path) if screenshot_path else '',
                    'metrics': metrics, 'blank_stage': blank_stage}
            if blank_stage.get('appears_blank'):
                issues = list(base.get('issues') or [])
                issues.insert(0, 'Bühne wirkt leer oder durchgehend weiß.')
                base['issues'] = issues[:8]
            return base

        prompt = build_screenshot_judge_prompt({
            **self._meta,
            'style_dna': self._dna,
            'layout_metrics': metrics,
        })
        ai = self._router.call_small(
            'screenshot_judge', prompt, response_schema=_JUDGE_SCHEMA, temperature=0.2,
        )
        if not isinstance(ai, dict) or not ai:
            base = {**fallback, 'ran': True, 'mode': 'heuristic',
                    'screenshot_path': str(screenshot_path) if screenshot_path else '',
                    'metrics': metrics, 'blank_stage': blank_stage}
            if blank_stage.get('appears_blank'):
                issues = list(base.get('issues') or [])
                issues.insert(0, 'Bühne wirkt leer oder durchgehend weiß.')
                base['issues'] = issues[:8]
            return base

        result = {
            'ran': True, 'mode': 'structured',
            'screenshot_path': str(screenshot_path) if screenshot_path else '',
            'metrics': metrics,
            'blank_stage': blank_stage,
            'overall_score': int(ai.get('overall_score') or fallback['overall_score']),
            'scores': {**fallback['scores'], **(ai.get('scores') or {})},
            'issues': [str(x).strip()[:240] for x in (ai.get('issues') or []) if str(x).strip()][:6],
            'repair_suggestions': [str(x).strip()[:240]
                                    for x in (ai.get('repair_suggestions') or [])
                                    if str(x).strip()][:5],
        }
        # Scores normalisieren auf 0..10
        for key, val in list(result['scores'].items()):
            try:
                result['scores'][key] = max(0, min(10, int(val)))
            except (TypeError, ValueError):
                result['scores'][key] = fallback['scores'].get(key, 5)
        result['overall_score'] = max(0, min(100, result['overall_score']))
        if blank_stage.get('appears_blank'):
            issues = list(result.get('issues') or [])
            issues.insert(0, 'Bühne wirkt leer oder durchgehend weiß.')
            result['issues'] = issues[:8]
            result['overall_score'] = min(result['overall_score'], 45)
        return result

    # ------------------------------------------------------------------
    # TODO (Vision-Pfad): Multimodal-Bewertung mit Gemini.
    #
    # Implementierungsskizze::
    #
    #     def _evaluate_with_vision(self, screenshot_path: Path, metrics: dict) -> dict | None:
    #         # genai.GenerativeModel(SMARTBOARD_LARGE_MODEL).generate_content([
    #         #     types.Part.from_data(screenshot_path.read_bytes(), 'image/png'),
    #         #     prompt_text,
    #         # ])
    #         ...
    #
    # Aktuell deaktiviert via ``SMARTBOARD_ENABLE_VISION_JUDGE`` (Default False).
    # Beim Aktivieren bitte:
    #  1. Vision-fähigen Provider in ``ai_model_router`` durchreichen.
    #  2. AIUsageLog-step_type bleibt ``screenshot_judge``.
    #  3. ``ScreenshotQualityJudge.run`` ruft diesen Pfad bevorzugt, fallback bleibt structured.
    # ------------------------------------------------------------------
    def _evaluate_with_vision(self, screenshot_path: Path, metrics: dict) -> dict | None:  # noqa: ARG002
        return None
