"""Headless-Browser-Visuelle QA für Free-HTML-Boards (Überlappungen, Bühne, Laufzeitfehler)."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from django.conf import settings

from .free_html_visual_doc import build_visual_qa_document
from .visual_resource_registry import filter_used_libraries

logger = logging.getLogger(__name__)

LAYOUT_EVAL_JS = """
() => {
  const errors = [];
  const warnings = [];
  const root = document.getElementById('board-root');
  if (!root) {
    errors.push('Kein #board-root im Dokument.');
    return { errors, warnings };
  }
  const bodies = document.body ? document.body.querySelectorAll('pre') : [];
  for (const p of bodies) {
    const t = (p.textContent || '').trim();
    if (t.startsWith('Skriptfehler:')) {
      errors.push('Laufzeitfehler im Board: ' + t.slice(0, 220));
    }
  }

  const scrollExcess = root.scrollHeight - root.clientHeight;
  if (scrollExcess > 10) {
    warnings.push(
      '#board-root hat vertikalen Überlauf (' + Math.round(scrollExcess) +
      'px). Inhalt ggf. straffen oder Bereiche scrollbar strukturieren.'
    );
  }

  const rootRect = root.getBoundingClientRect();
  const tol = 8;
  const sel = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"]';
  const nodes = Array.from(root.querySelectorAll(sel)).filter((el) => {
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  });

  let clipCount = 0;
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.bottom > rootRect.bottom + tol || r.right > rootRect.right + tol ||
        r.top < rootRect.top - tol || r.left < rootRect.left - tol) {
      clipCount += 1;
      if (clipCount <= 4) {
        errors.push(
          'Bedien- oder Klickelement ragt über die 1280×720-Bühne hinaus oder wird abgeschnitten (' +
          el.tagName.toLowerCase() + ').'
        );
      }
    }
  }

  const overlapMin = 44 * 44 * 0.3;
  let overlapReports = 0;
  for (let i = 0; i < nodes.length && overlapReports < 8; i++) {
    const a = nodes[i].getBoundingClientRect();
    const areaA = a.width * a.height;
    if (areaA < 25) continue;
    for (let j = i + 1; j < nodes.length && overlapReports < 8; j++) {
      const b = nodes[j].getBoundingClientRect();
      const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const inter = ix * iy;
      if (inter < overlapMin) continue;
      const sb = b.width * b.height;
      const smaller = Math.min(areaA, sb);
      if (smaller > 0 && inter / smaller > 0.22) {
        errors.push(
          'Starke Überlappung zweier Bedienelemente (' +
          nodes[i].tagName.toLowerCase() + ' / ' + nodes[j].tagName.toLowerCase() + ').'
        );
        overlapReports += 1;
      }
    }
  }

  return { errors, warnings };
}
"""


def visual_qa_playwright_available() -> bool:
    try:
        import playwright.sync_api  # noqa: F401

        return True
    except ImportError:
        return False


def _board_public_datasets_dir() -> Path:
    return Path(settings.BASE_DIR).resolve().parent / 'frontend' / 'public' / 'board-datasets'


def load_board_datasets_for_qa(used_dataset_ids: list[Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    base = _board_public_datasets_dir()
    if not base.is_dir():
        logger.warning('Visuelle QA: board-datasets-Verzeichnis fehlt: %s', base)
        return out
    for raw in used_dataset_ids or []:
        fid = str(raw).strip()
        if not fid:
            continue
        path = base / f'{fid}.json'
        if not path.is_file():
            logger.warning('Visuelle QA: Dataset-Datei fehlt: %s', path)
            continue
        try:
            out[fid] = json.loads(path.read_text(encoding='utf-8'))
        except json.JSONDecodeError as exc:
            logger.warning('Visuelle QA: Dataset %s nicht lesbar: %s', fid, exc)
    return out


def run_visual_layout_qa(bundle: dict[str, Any], *, document_base_href: str) -> tuple[list[str], list[str]]:
    """
    Rendert das Bundle headless und liefert (errors, warnings).
    Fehler blockieren 'generated' (werden wie Validierungsfehler in die Reparaturschleife eingespeist).
    """
    if not getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True):
        return [], ['Visuelle QA ist auf dem Server deaktiviert (BOARDS_VISUAL_QA_ALLOWED).']

    if not visual_qa_playwright_available():
        raise RuntimeError(
            'Visuelle Qualitätsprüfung ist nicht verfügbar: Python-Paket „playwright“ fehlt. '
            'Installation: pip install playwright && playwright install chromium'
        )

    href = (document_base_href or '').strip() or str(
        getattr(settings, 'BOARDS_VISUAL_QA_DOCUMENT_BASE', '') or ''
    ).strip()
    if not href:
        raise RuntimeError(
            'Visuelle QA: BOARDS_VISUAL_QA_DOCUMENT_BASE ist nicht gesetzt '
            '(z. B. http://127.0.0.1:5173/ — Vite mit /board-libs und /board-assets).'
        )

    used_libs = filter_used_libraries(bundle.get('used_libraries'))
    used_ds = bundle.get('used_datasets') or []
    datasets_obj = load_board_datasets_for_qa(used_ds if isinstance(used_ds, list) else [])

    doc = build_visual_qa_document(
        html=str(bundle.get('html') or ''),
        css=str(bundle.get('css') or ''),
        javascript=str(bundle.get('javascript') or ''),
        used_libraries=used_libs,
        board_datasets=datasets_obj,
        document_base_href=href,
        scripts_enabled=True,
    )

    from playwright.sync_api import sync_playwright

    console_errors: list[str] = []
    page_errors: list[str] = []
    result: dict[str, Any] = {'errors': [], 'warnings': []}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 900})

            def on_console(msg) -> None:
                if msg.type == 'error':
                    try:
                        t = msg.text
                    except Exception:
                        t = str(msg)
                    if t and t not in console_errors:
                        console_errors.append(t[:400])

            page.on('console', on_console)

            def on_page_error(exc) -> None:
                s = str(exc)
                if s and s not in page_errors:
                    page_errors.append(s[:500])

            page.on('pageerror', on_page_error)
            page.set_content(doc, wait_until='load', timeout=90_000)
            page.wait_for_timeout(1000)
            try:
                result = page.evaluate(LAYOUT_EVAL_JS)
            except Exception as exc:
                logger.exception('Visuelle QA: page.evaluate fehlgeschlagen')
                err_list = [f'Visuelle Prüfung technisch fehlgeschlagen: {exc}']
                return err_list, []
        finally:
            browser.close()

    err_list = [str(x) for x in (result.get('errors') or []) if x]
    warn_list = [str(x) for x in (result.get('warnings') or []) if x]

    for pe in page_errors[:5]:
        err_list.append(f'JavaScript-Fehler beim Rendern: {pe}')
    for ce in console_errors[:5]:
        if any(x in ce.lower() for x in ('failed to load', '404', 'net::err', 'refused to load')):
            err_list.append(f'Ressourcenfehler (Konsole): {ce}')
        else:
            warn_list.append(f'Konsole: {ce}')

    return err_list, warn_list


def default_visual_qa_document_base() -> str:
    return str(getattr(settings, 'BOARDS_VISUAL_QA_DOCUMENT_BASE', '') or '').strip()
