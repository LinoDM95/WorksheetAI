"""TouchAuditService — prüft Touch-Tauglichkeit von Free-HTML-Bundles.

Zwei Pfade:
1. **Statisch** (immer verfügbar): regex-basierte Heuristik auf HTML+CSS, BBox-
   Approximation aus min-width/min-height + Padding.
2. **Headless via Playwright** (wenn ``BOARDS_VISUAL_QA_ALLOWED`` und Playwright
   installiert): rendert die Bühne und misst die echten BoundingClientRects.

Output ist immer ein Dict ``{ran, score, passed, issues, recommendations,
mode, threshold_px}`` — ohne Ausnahmen, damit die Pipeline weiterlaufen kann.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from django.conf import settings

from .free_html_visual_doc import build_visual_qa_document
from .free_html_visual_qa import (
    default_visual_qa_document_base,
    load_board_datasets_for_qa,
    visual_qa_playwright_available,
)
from .visual_resource_registry import filter_used_libraries

logger = logging.getLogger(__name__)


_HTML_INTERACTIVE_RE = re.compile(
    r'<\s*(button|input|select|textarea)\b[^>]*>|role\s*=\s*[\'"](button|tab|switch|slider)[\'"]',
    re.IGNORECASE,
)
_CSS_RULE_RE = re.compile(r'([^{}]+)\{([^{}]*)\}', re.MULTILINE)
_DECL_RE = re.compile(r'([a-zA-Z\-]+)\s*:\s*([^;]+);?')
_PX_VALUE_RE = re.compile(r'(\d+(?:\.\d+)?)\s*px', re.IGNORECASE)


_TOUCH_AUDIT_JS = r"""
() => {
  const issues = [];
  const root = document.getElementById('board-root') || document.querySelector('.free-board');
  if (!root) {
    return { score: 0, passed: false, issues: [{type: 'missing_root', message: 'Kein .free-board / #board-root gefunden.', severity: 'error'}], recommendations: [] };
  }
  const sel = 'button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [role="slider"], .touch-target';
  const nodes = Array.from(root.querySelectorAll(sel)).filter((el) => {
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  });
  if (nodes.length === 0) {
    return { score: 90, passed: true, issues: [{type: 'no_interactive', message: 'Keine interaktiven Elemente gefunden — wahrscheinlich rein darstellendes Board.', severity: 'warning'}], recommendations: [], element_count: 0 };
  }
  const min = window.__BOARDS_TOUCH_MIN__ || 56;
  const tooSmall = [];
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width < min || r.height < min) {
      tooSmall.push({tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height)});
    }
  }
  if (tooSmall.length) {
    issues.push({
      type: 'small_touch_target',
      message: `${tooSmall.length} Bedienelemente unter ${min}px (z. B. ${tooSmall.slice(0,3).map(s => `${s.tag} ${s.w}×${s.h}`).join(', ')}).`,
      severity: 'error',
      count: tooSmall.length,
    });
  }
  // Mindestabstand 16px zwischen Bedienelementen
  let tooClose = 0;
  for (let i = 0; i < nodes.length && tooClose < 6; i++) {
    const a = nodes[i].getBoundingClientRect();
    for (let j = i + 1; j < nodes.length && tooClose < 6; j++) {
      const b = nodes[j].getBoundingClientRect();
      const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      const horizontal = a.right < b.left || b.right < a.left;
      const vertical = a.bottom < b.top || b.bottom < a.top;
      if ((horizontal && dx < 16) || (vertical && dy < 16)) tooClose += 1;
    }
  }
  if (tooClose) {
    issues.push({type: 'touch_close', message: `${tooClose} Paare Bedienelemente liegen näher als 16px.`, severity: 'warning'});
  }
  // Score
  const totalErr = issues.filter((i) => i.severity === 'error').reduce((acc, i) => acc + (i.count || 1), 0);
  const totalWarn = issues.filter((i) => i.severity === 'warning').length;
  const score = Math.max(0, 100 - totalErr * 12 - totalWarn * 4);
  const passed = totalErr === 0;
  return { score, passed, issues, recommendations: [], element_count: nodes.length };
}
"""


def _static_audit(html: str, css: str, *, threshold_px: int) -> dict[str, Any]:
    """Schwache Heuristik ohne DOM. Findet harte Verstöße (z. B. min-height: 24px)."""
    issues: list[dict[str, Any]] = []
    h = html or ''
    c = css or ''
    interactive_count = len(_HTML_INTERACTIVE_RE.findall(h))

    if not h.strip():
        return {
            'ran': True, 'mode': 'static', 'score': 0, 'passed': False,
            'threshold_px': threshold_px,
            'issues': [{'type': 'empty_html', 'message': 'HTML ist leer.', 'severity': 'error'}],
            'recommendations': [], 'element_count': 0,
        }

    if interactive_count == 0:
        return {
            'ran': True, 'mode': 'static', 'score': 90, 'passed': True,
            'threshold_px': threshold_px,
            'issues': [{
                'type': 'no_interactive',
                'message': 'Keine interaktiven Elemente erkannt — Touch-Audit weitgehend irrelevant.',
                'severity': 'warning',
            }],
            'recommendations': [], 'element_count': 0,
        }

    small_button_rules = 0
    for rule_match in _CSS_RULE_RE.finditer(c):
        selector = rule_match.group(1).strip()
        body = rule_match.group(2)
        if not re.search(r'(?:button|input|select|\[role=|\.touch-target|\.btn)', selector, re.IGNORECASE):
            continue
        for decl in _DECL_RE.finditer(body):
            prop = decl.group(1).strip().lower()
            value = decl.group(2).strip()
            if prop in ('min-width', 'min-height', 'width', 'height'):
                m = _PX_VALUE_RE.match(value)
                if m and float(m.group(1)) < threshold_px:
                    small_button_rules += 1
                    break

    if small_button_rules:
        issues.append({
            'type': 'small_touch_target',
            'message': f'{small_button_rules} CSS-Regel(n) definieren Bedienelemente kleiner als {threshold_px}px.',
            'severity': 'error',
            'count': small_button_rules,
        })

    if re.search(r':hover\s*{[^}]*\b(display|visibility|opacity)\s*:', c, re.IGNORECASE):
        issues.append({
            'type': 'hover_only',
            'message': ':hover steuert Sichtbarkeit — auf Smartboard nicht erreichbar.',
            'severity': 'warning',
        })

    # Pointer-Events vs. nur Mouse/Touch
    j_lower = ' '.join([h, c]).lower()
    if 'mousedown' in j_lower and 'pointerdown' not in j_lower:
        issues.append({
            'type': 'mouse_only',
            'message': 'mousedown ohne Pointer-Events — Touch-Geräte werden nicht zuverlässig unterstützt.',
            'severity': 'warning',
        })

    err_count = sum(int(i.get('count') or 1) for i in issues if i.get('severity') == 'error')
    warn_count = sum(1 for i in issues if i.get('severity') == 'warning')
    score = max(0, 100 - err_count * 12 - warn_count * 4)
    passed = err_count == 0
    return {
        'ran': True, 'mode': 'static', 'score': score, 'passed': passed,
        'threshold_px': threshold_px,
        'issues': issues, 'recommendations': [], 'element_count': interactive_count,
    }


def _playwright_audit(bundle: dict, *, threshold_px: int, document_base_href: str) -> dict[str, Any]:
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
    from playwright.sync_api import sync_playwright

    result: dict[str, Any] = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 900})
            page.set_content(doc, wait_until='load', timeout=90_000)
            page.evaluate(f'window.__BOARDS_TOUCH_MIN__ = {int(threshold_px)};')
            page.wait_for_timeout(500)
            try:
                result = page.evaluate(_TOUCH_AUDIT_JS) or {}
            except Exception:  # noqa: BLE001 — Render-Fehler nicht hochreichen
                logger.exception('TouchAudit: page.evaluate fehlgeschlagen')
                result = {}
        finally:
            browser.close()
    if not isinstance(result, dict):
        result = {}
    result.setdefault('issues', [])
    result.setdefault('recommendations', [])
    result.setdefault('score', 0)
    result.setdefault('passed', False)
    result['ran'] = True
    result['mode'] = 'playwright'
    result['threshold_px'] = threshold_px
    return result


class TouchAuditService:
    """Touch-Audit für ein sanitisiertes Bundle.

    ``style_dna`` steuert das Threshold (Grundschule → 64 px statt 56 px).
    """

    def __init__(self, *, style_dna: dict | None = None) -> None:
        self._dna = style_dna or {}

    def _threshold(self) -> int:
        age = (self._dna.get('age_style') or '').lower()
        return 64 if age in ('kindergarten', 'primary') else 56

    def run(self, bundle: dict) -> dict[str, Any]:
        if not getattr(settings, 'SMARTBOARD_ENABLE_TOUCH_AUDIT', True):
            return {'ran': False, 'mode': 'disabled', 'score': 0, 'passed': True, 'issues': [], 'recommendations': []}
        threshold = self._threshold()
        bundle = bundle or {}
        html = str(bundle.get('html') or '')
        css = str(bundle.get('css') or '')

        if not getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True) or not visual_qa_playwright_available():
            return _static_audit(html, css, threshold_px=threshold)
        href = default_visual_qa_document_base()
        if not href:
            return _static_audit(html, css, threshold_px=threshold)
        try:
            return _playwright_audit(bundle, threshold_px=threshold, document_base_href=href)
        except Exception:  # noqa: BLE001 — Playwright nicht verfügbar/abgestürzt → Fallback
            logger.exception('TouchAudit: Playwright-Pfad fehlgeschlagen, Fallback auf Static')
            result = _static_audit(html, css, threshold_px=threshold)
            result['warnings'] = ['Playwright fehlgeschlagen — statische Heuristik verwendet.']
            return result
