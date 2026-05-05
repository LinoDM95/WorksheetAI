"""Auto-Discovery: identifiziert (Fach × Themenfeld × Klassenband × Seiten)-Plan
für eine RLP-PDF, ohne dass der Lehrer einzelne Seitenbereiche raussucht.

Ablauf:
1. Inhaltsverzeichnis → strukturierte Liste aller Fächer (TOC-Pass).
2. Erster Plan über TOC + Stichproben.
3. Solange TOC-Fächer ohne Eintrag fehlen: Nachzieh-Pässe mit Fokus auf die Lücken."""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.conf import settings

from apps.curricula.models import CurriculumSource

logger = logging.getLogger(__name__)


_DISCOVERY_PROMPT = """Du bist ein Curriculum-Analyse-Assistent für deutsche Rahmenlehrpläne (RLP).

Du erhältst:
- eine Liste **aller Fächer aus dem Inhaltsverzeichnis** (bereits extrahiert — sie müssen alle im Plan abgebildet sein),
- Auszüge aus dem PDF-Inhaltsverzeichnis und Stichprobenseiten.

Identifiziere für **jedes genannte Fach** und **jedes zugehörige Themenfeld**, das im Dokument behandelt wird,
einen kompakten Plan-Eintrag mit der Seitenspanne, in der die fachlichen Details stehen.

Regeln:
- **Jedes Fach aus „FÄCHER_LAUT_TOC“ muss im Plan mindestens einmal vorkommen.** Fehlen Unterkapitel, nutze topic_area „Gesamtüberblick“ oder das erste große Kapitel dieses Fachs im TOC.
- Bevorzuge fachliche Themenfelder (z. B. „Zahlen und Operationen“, „Lesen und Schreiben“),
  keine reinen Titelseiten oder Vorworte.
- Eine Seitenspanne sollte zusammenhängend sein (page_start <= page_end).
- Halte page_end - page_start <= {{MAX_SLICE}} (kürze inhaltlich, falls länger).
- grade_band als kompakte Form: „1-2“, „3-4“, „5-6“, „7-10“, „11-12“ oder konkrete Klasse.
- level_band: leere Liste oder z. B. [„Niveaustufe A“,„Niveaustufe B“,„Niveaustufe C“].
- subject: **exakt oder sehr nah** am Fachnamen aus „FÄCHER_LAUT_TOC“ (z. B. „Mathematik“, nicht „Math“).
- topic_area: prägnant, ein Themenfeld, max. 80 Zeichen.
- confidence: Zahl 0.0–1.0 für Sicherheit der Zuordnung.
- Antworte NUR als gültiges JSON mit Schlüssel „plan“ als Array.

Quellen:
PDF-Titel: {{TITLE}}
Bundesland: {{STATE}}
Gesamtanzahl Seiten: {{TOTAL_PAGES}}

--- FÄCHER_LAUT_TOC (alle müssen im Plan vorkommen) ---
{{TOC_SUBJECT_LINE}}

--- INHALTSVERZEICHNIS / EINFÜHRUNG ---
{{TOC_TEXT}}

--- INHALTLICHE STICHPROBEN ---
{{SAMPLE_TEXT}}
"""


_DISCOVERY_FILL_PROMPT = """Du bist ein Curriculum-Analyse-Assistent für deutsche Rahmenlehrpläne (RLP).

Die folgenden **Fächer aus dem offiziellen Inhaltsverzeichnis haben im bisherigen Plan noch keine oder keine klare Zuordnung**.
Erzeuge für **jedes aufgeführte fehlende Fach mindestens einen** Plan-Eintrag mit realistischer Seitenspanne.

Regeln:
- subject muss zum Fachnamen passen (Schreibweise wie im Dokument üblich).
- Wenn „Seitenhinweise aus TOC“ genannt sind, nutze sie für page_start/page_end (max. Spanne {{MAX_SLICE}}).
- Sonst: schlage plausible Seiten aus dem PDF-Umfang vor ({{TOTAL_PAGES}} Seiten).
- topic_area: erstes großes Unterkapitel dieses Fachs oder „Gesamtüberblick“, falls unklar.
- grade_band: wenn unbekannt „gesamt“.
- confidence ehrlich niedrig setzen (z. B. 0.35–0.55), wenn du raten musst.
- Antworte NUR als gültiges JSON mit Schlüssel „plan“ als Array.

PDF-Titel: {{TITLE}}
Bundesland: {{STATE}}

--- FEHLENDE FÄCHER (mit optionalen TOC-Seitenhinweisen) ---
{{MISSING_BLOCK}}

--- RELEVANTE PDF-AUSZÜGE ---
{{FOCUS_TEXT}}
"""


_TOC_SUBJECTS_PROMPT = """Du bist ein Curriculum-Analyse-Assistent für deutsche Rahmenlehrpläne (RLP).

Aus dem folgenden Text (vor allem **Inhaltsverzeichnis**, „Teil C“, „Fachlehrpläne“, Stufen-/Klassenteile):
Extrahiere **jedes eigenständige Unterrichtsfach / jedes Fach**, das als eigener Hauptblock gelistet ist.

Regeln:
- Nimm **alle** Fächer auf, die im Inhaltsverzeichnis als Hauptpunkte vorkommen (z. B. Mathematik, Deutsch, Englisch, Sport …).
- Keine reinen Überschriften wie „Inhalt“, „Vorwort“, „Abkürzungen“, keine Seitennummern allein.
- Optional: hint_page = Seitennummer aus dem TOC **falls** dort eine eindeutige Startseite für dieses Fach steht (sonst weglassen oder 0).
- Kurze, kanonische Fachnamen (wie im Dokument).
- Antworte NUR als gültiges JSON mit Schlüssel „subjects“ als Array von Objekten {„name“, „hint_page“}.

PDF-Titel: {{TITLE}}
Bundesland: {{STATE}}
Gesamtanzahl Seiten: {{TOTAL_PAGES}}

--- TEXT ---
{{TOC_TEXT}}
"""


_DISCOVERY_RESPONSE_SCHEMA: dict[str, Any] = {
    'type': 'OBJECT',
    'properties': {
        'plan': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'subject': {'type': 'STRING'},
                    'grade_band': {'type': 'STRING'},
                    'level_band': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
                    'topic_area': {'type': 'STRING'},
                    'page_start': {'type': 'INTEGER'},
                    'page_end': {'type': 'INTEGER'},
                    'confidence': {'type': 'NUMBER'},
                },
            },
        },
    },
}


_TOC_SUBJECTS_SCHEMA: dict[str, Any] = {
    'type': 'OBJECT',
    'properties': {
        'subjects': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'name': {'type': 'STRING'},
                    'hint_page': {'type': 'INTEGER'},
                },
            },
        },
    },
}


def _provider_name() -> str:
    name = (getattr(settings, 'CURRICULUM_AUTO_DISCOVERY_PROVIDER', '') or '').strip().lower()
    if name:
        return name
    name = (getattr(settings, 'CURRICULUM_EXTRACTION_PROVIDER', '') or '').strip().lower()
    if name:
        return name
    return (getattr(settings, 'AI_PROVIDER', None) or 'gemini').strip().lower()


def _max_slice() -> int:
    return int(getattr(settings, 'CURRICULUM_AUTO_MAX_PAGES_PER_SLICE', 12) or 12)


def _max_total_slices() -> int:
    return int(getattr(settings, 'CURRICULUM_AUTO_MAX_TOTAL_SLICES', 80) or 80)


def _hard_cap_slices() -> int:
    return int(getattr(settings, 'CURRICULUM_AUTO_MAX_TOTAL_SLICES_HARD_CAP', 400) or 400)


def _discovery_max_rounds() -> int:
    return max(1, int(getattr(settings, 'CURRICULUM_AUTO_DISCOVERY_MAX_ROUNDS', 6) or 6))


def _toc_page_window() -> int:
    return max(4, int(getattr(settings, 'CURRICULUM_AUTO_TOC_PAGES', 14) or 14))


def _retry_limit() -> int:
    return int(getattr(settings, 'CURRICULUM_AUTO_RETRY_LIMIT', 2) or 2)


def _temperature() -> float:
    return float(getattr(settings, 'CURRICULUM_AUTO_DISCOVERY_TEMPERATURE', 0.0) or 0.0)


def _effective_max_slices(toc_subject_count: int) -> int:
    base = _max_total_slices()
    hard = _hard_cap_slices()
    if toc_subject_count <= 0:
        return min(hard, base)
    boosted = max(base, toc_subject_count * 15)
    return min(hard, boosted)


def _build_inputs(source: CurriculumSource) -> tuple[str, str, int]:
    pages: list[dict[str, Any]] = list(source.extracted_pages or [])
    total = len(pages)
    toc_n = min(_toc_page_window(), total) if total else 0
    toc_pages = pages[:toc_n]
    toc_text = '\n'.join(
        f'--- Seite {p.get("page")} ---\n{(p.get("text") or "").strip()}' for p in toc_pages if isinstance(p, dict)
    )
    sample_pages = []
    for idx, p in enumerate(pages[toc_n:], start=toc_n):
        if not isinstance(p, dict):
            continue
        if (idx - toc_n) % 5 == 0:
            sample_pages.append(p)
    sample_text_parts: list[str] = []
    budget = 30_000
    for p in sample_pages:
        text = (p.get('text') or '').strip()
        if not text:
            continue
        snippet = text[:1500]
        block = f'--- Seite {p.get("page")} ---\n{snippet}'
        if budget - len(block) < 0:
            break
        sample_text_parts.append(block)
        budget -= len(block)
    sample_text = '\n\n'.join(sample_text_parts)
    return toc_text[:35_000], sample_text, total


def _gemini_json(prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
    from google import genai
    from google.genai import types

    api_key = getattr(settings, 'GEMINI_API_KEY', '') or ''
    if not api_key.strip():
        raise RuntimeError('GEMINI_API_KEY fehlt für Auto-Discovery.')
    client = genai.Client(api_key=api_key)
    model = getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-flash')
    cfg = types.GenerateContentConfig(
        temperature=_temperature(),
        max_output_tokens=min(getattr(settings, 'GEMINI_MAX_OUTPUT_TOKENS', 8192), 65536),
        response_mime_type='application/json',
        response_schema=schema,
    )
    resp = client.models.generate_content(model=model, contents=prompt, config=cfg)
    text = resp.text or '{}'
    return json.loads(text)


def _coerce_int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _normalize_topic(s: str) -> str:
    return re.sub(r'\s+', ' ', (s or '').strip().lower())


def _split_slice(entry: dict[str, Any], max_slice: int) -> list[dict[str, Any]]:
    start = entry.get('page_start')
    end = entry.get('page_end')
    if not isinstance(start, int) or not isinstance(end, int) or end < start:
        return [entry]
    span = end - start + 1
    if span <= max_slice:
        return [entry]
    parts: list[dict[str, Any]] = []
    cur = start
    while cur <= end:
        nxt = min(cur + max_slice - 1, end)
        clone = dict(entry)
        clone['page_start'] = cur
        clone['page_end'] = nxt
        parts.append(clone)
        cur = nxt + 1
    return parts


def _entries_from_raw(raw: Any, total_pages: int) -> list[dict[str, Any]]:
    if isinstance(raw, dict):
        items = raw.get('plan')
    elif isinstance(raw, list):
        items = raw
    else:
        items = []
    if not isinstance(items, list):
        items = []
    cleaned: list[dict[str, Any]] = []
    for entry in items:
        if not isinstance(entry, dict):
            continue
        subject = (entry.get('subject') or '').strip()
        topic = (entry.get('topic_area') or '').strip()
        grade = (entry.get('grade_band') or '').strip()
        ps = _coerce_int(entry.get('page_start'))
        pe = _coerce_int(entry.get('page_end'))
        if not subject or not topic:
            continue
        if ps is None or pe is None:
            continue
        if total_pages > 0:
            ps = max(1, min(ps, total_pages))
            pe = max(1, min(pe, total_pages))
        if pe < ps:
            ps, pe = pe, ps
        level_band_raw = entry.get('level_band') or []
        level_band = [str(x).strip() for x in level_band_raw if isinstance(x, (str, int))] if isinstance(
            level_band_raw, list
        ) else []
        confidence_val = entry.get('confidence')
        try:
            confidence = float(confidence_val) if confidence_val is not None else 0.0
        except (TypeError, ValueError):
            confidence = 0.0
        cleaned.append(
            {
                'subject': subject[:120],
                'grade_band': grade[:60] or 'gesamt',
                'level_band': level_band,
                'topic_area': topic[:200],
                'page_start': ps,
                'page_end': pe,
                'confidence': max(0.0, min(1.0, confidence)),
            },
        )
    return cleaned


def _finalize_plan(cleaned_entries: list[dict[str, Any]], total_pages: int, max_slices: int) -> list[dict[str, Any]]:
    if not cleaned_entries:
        return []
    expanded: list[dict[str, Any]] = []
    for entry in cleaned_entries:
        expanded.extend(_split_slice(entry, _max_slice()))

    seen: set[tuple[str, str, str]] = set()
    deduped: list[dict[str, Any]] = []
    for entry in expanded:
        key = (
            _normalize_topic(entry['subject']),
            _normalize_topic(entry['grade_band']),
            _normalize_topic(entry['topic_area']),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(entry)

    deduped.sort(key=lambda e: (e['subject'].lower(), e['grade_band'], e['page_start']))
    cap = max_slices
    if len(deduped) > cap:
        deduped = deduped[:cap]
    return deduped


def _toc_subject_in_plan(toc_name: str, accumulated_entries: list[dict[str, Any]]) -> bool:
    tn = _normalize_topic(toc_name)
    if len(tn) < 2:
        return True
    for entry in accumulated_entries:
        sn = _normalize_topic(entry.get('subject') or '')
        if not sn:
            continue
        if tn == sn:
            return True
        if len(tn) >= 4 and len(sn) >= 4 and (tn in sn or sn in tn):
            return True
    return False


def _missing_toc_rows(
    toc_rows: list[dict[str, Any]],
    accumulated_entries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in toc_rows:
        if not isinstance(row, dict):
            continue
        name = (row.get('name') or '').strip()
        if not name:
            continue
        if not _toc_subject_in_plan(name, accumulated_entries):
            hint = _coerce_int(row.get('hint_page'))
            item = {'name': name}
            if hint is not None and hint > 0:
                item['hint_page'] = hint
            out.append(item)
    return out


def _sample_focus_text(
    pages: list[dict[str, Any]],
    missing_rows: list[dict[str, Any]],
    total_pages: int,
    budget: int = 24_000,
) -> str:
    if not pages or not missing_rows:
        return ''
    wanted_pages: set[int] = set()
    for row in missing_rows:
        hp = _coerce_int(row.get('hint_page'))
        if hp is None or hp <= 0:
            continue
        lo = max(1, hp - 2)
        hi = min(total_pages, hp + 2) if total_pages else hp + 2
        for p in range(lo, hi + 1):
            wanted_pages.add(p)
    if not wanted_pages:
        for pdict in pages[: max(_toc_page_window(), 12)]:
            if not isinstance(pdict, dict):
                continue
            pn = int(pdict.get('page') or 0)
            if pn > 0:
                wanted_pages.add(pn)
    parts: list[str] = []
    remaining = budget
    for pdict in pages:
        if not isinstance(pdict, dict):
            continue
        pn = int(pdict.get('page') or 0)
        if pn not in wanted_pages:
            continue
        text = (pdict.get('text') or '').strip()
        if not text:
            continue
        snippet = text[:2200]
        block = f'--- Seite {pn} ---\n{snippet}'
        if remaining - len(block) < 0:
            break
        parts.append(block)
        remaining -= len(block)
    return '\n\n'.join(parts)


def _parse_toc_subjects(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, dict):
        return []
    subs = raw.get('subjects')
    if not isinstance(subs, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in subs:
        if not isinstance(item, dict):
            continue
        name = (item.get('name') or '').strip()
        if not name:
            continue
        row: dict[str, Any] = {'name': name[:160]}
        hp = _coerce_int(item.get('hint_page'))
        if hp is not None and hp > 0:
            row['hint_page'] = hp
        rows.append(row)
    dedup: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = _normalize_topic(row['name'])
        if key not in dedup:
            dedup[key] = row
    return list(dedup.values())


def _toc_subject_line(toc_rows: list[dict[str, Any]]) -> str:
    lines = []
    for row in toc_rows:
        name = row.get('name') or ''
        hp = row.get('hint_page')
        if hp:
            lines.append(f'- {name} (TOC-Seitenhinweis: {hp})')
        else:
            lines.append(f'- {name}')
    return '\n'.join(lines) if lines else '(keine TOC-Fächer extrahiert — nur Stichproben nutzen)'


def _gemini_with_retries(prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
    attempts = 0
    last_err: str | None = None
    while attempts <= _retry_limit():
        attempts += 1
        try:
            return _gemini_json(prompt, schema)
        except json.JSONDecodeError as exc:
            last_err = f'JSON-Parsing fehlgeschlagen: {exc}'
            logger.warning('Auto-Discovery JSON parse failed (attempt %s): %s', attempts, exc)
        except Exception as exc:
            last_err = str(exc)[:500]
            logger.exception('Auto-Discovery call failed (attempt %s)', attempts)
    raise RuntimeError(last_err or 'KI-Aufruf fehlgeschlagen.')


def _mock_toc_rows(source: CurriculumSource) -> list[dict[str, Any]]:
    total = max(int(source.page_count or 0), 4)
    return [
        {'name': 'Mathematik', 'hint_page': 1},
        {'name': 'Deutsch', 'hint_page': min(3, total)},
    ]


def _mock_plan(source: CurriculumSource) -> list[dict[str, Any]]:
    total = max(int(source.page_count or 0), 4)
    return [
        {
            'subject': 'MOCK · Mathematik',
            'grade_band': '1-2',
            'level_band': [],
            'topic_area': 'MOCK - nur technischer Test (Zahlen und Operationen)',
            'page_start': 1,
            'page_end': min(2, total),
            'confidence': 0.5,
        },
        {
            'subject': 'MOCK · Deutsch',
            'grade_band': '1-2',
            'level_band': [],
            'topic_area': 'MOCK - nur technischer Test (Lesen und Schreiben)',
            'page_start': min(3, total),
            'page_end': min(4, total),
            'confidence': 0.5,
        },
    ]


class CurriculumAutoDiscoveryService:
    """Erstellt einen Discovery-Plan aus dem PDF-Text einer Source."""

    @classmethod
    def run(cls, source: CurriculumSource) -> dict[str, Any]:
        if source.extraction_status != CurriculumSource.EXTRACTION_DONE:
            source.discovery_status = CurriculumSource.DISCOVERY_FAILED
            source.discovery_error = 'PDF-Text ist noch nicht extrahiert.'
            source.discovery_plan = []
            source.save(
                update_fields=[
                    'discovery_status',
                    'discovery_error',
                    'discovery_plan',
                    'updated_at',
                ],
            )
            return {'ok': False, 'error': source.discovery_error}

        source.discovery_status = CurriculumSource.DISCOVERY_RUNNING
        source.discovery_error = ''
        source.save(update_fields=['discovery_status', 'discovery_error', 'updated_at'])

        toc_text, sample_text, total = _build_inputs(source)
        if not toc_text and not sample_text:
            source.discovery_status = CurriculumSource.DISCOVERY_FAILED
            source.discovery_error = 'PDF enthält keinen lesbaren Text (möglicherweise gescannt; OCR nicht aktiviert).'
            source.save(update_fields=['discovery_status', 'discovery_error', 'updated_at'])
            return {'ok': False, 'error': source.discovery_error}

        provider = _provider_name()
        toc_rows: list[dict[str, Any]] = []
        accumulated: list[dict[str, Any]] = []
        fill_rounds_run = 0
        meta_missing_snapshots: list[list[str]] = []

        try:
            if provider == 'mock':
                toc_rows = _mock_toc_rows(source)
                accumulated.extend(_entries_from_raw({'plan': _mock_plan(source)}, total))
            else:
                toc_prompt = (
                    _TOC_SUBJECTS_PROMPT.replace('{{TITLE}}', source.title or '')
                    .replace('{{STATE}}', source.state or '')
                    .replace('{{TOTAL_PAGES}}', str(total))
                    .replace('{{TOC_TEXT}}', toc_text)
                )
                try:
                    toc_raw = _gemini_with_retries(toc_prompt, _TOC_SUBJECTS_SCHEMA)
                    toc_rows = _parse_toc_subjects(toc_raw)
                except Exception as exc:
                    logger.warning('TOC-Fächerauszug fehlgeschlagen, fallback ohne TOC-Liste: %s', exc)
                    toc_rows = []

                max_slices = _effective_max_slices(len(toc_rows))

                toc_line = _toc_subject_line(toc_rows)
                prompt_main = (
                    _DISCOVERY_PROMPT.replace('{{MAX_SLICE}}', str(_max_slice()))
                    .replace('{{TITLE}}', source.title or '')
                    .replace('{{STATE}}', source.state or '')
                    .replace('{{TOTAL_PAGES}}', str(total))
                    .replace('{{TOC_SUBJECT_LINE}}', toc_line)
                    .replace('{{TOC_TEXT}}', toc_text)
                    .replace('{{SAMPLE_TEXT}}', sample_text)
                )
                raw_main = _gemini_with_retries(prompt_main, _DISCOVERY_RESPONSE_SCHEMA)
                accumulated.extend(_entries_from_raw(raw_main, total))

                missing = _missing_toc_rows(toc_rows, accumulated)
                meta_missing_snapshots.append([m['name'] for m in missing])
                rounds_cap = _discovery_max_rounds()
                pages_list = list(source.extracted_pages or [])

                while missing and fill_rounds_run < rounds_cap:
                    fill_rounds_run += 1
                    missing_block = '\n'.join(
                        (
                            f"- {m['name']}" + (f" → TOC-Seite ~{m['hint_page']}" if m.get('hint_page') else '')
                        )
                        for m in missing
                    )
                    focus = _sample_focus_text(pages_list, missing, total)
                    prompt_fill = (
                        _DISCOVERY_FILL_PROMPT.replace('{{MAX_SLICE}}', str(_max_slice()))
                        .replace('{{TITLE}}', source.title or '')
                        .replace('{{STATE}}', source.state or '')
                        .replace('{{TOTAL_PAGES}}', str(total))
                        .replace('{{MISSING_BLOCK}}', missing_block or '(keine)')
                        .replace('{{FOCUS_TEXT}}', focus or toc_text[:8000])
                    )
                    raw_fill = _gemini_with_retries(prompt_fill, _DISCOVERY_RESPONSE_SCHEMA)
                    accumulated.extend(_entries_from_raw(raw_fill, total))
                    missing = _missing_toc_rows(toc_rows, accumulated)
                    meta_missing_snapshots.append([m['name'] for m in missing])
                    logger.info(
                        'Auto-Discovery Nachzieh-Runde %s: noch fehlende TOC-Fächer: %s',
                        fill_rounds_run,
                        len(missing),
                    )

                plan = _finalize_plan(accumulated, total, max_slices)
                if not plan:
                    raise RuntimeError('Leerer Plan nach TOC-gesteuerter Discovery.')

                source.discovery_plan = plan
                source.discovery_status = CurriculumSource.DISCOVERY_DONE
                source.discovery_error = ''
                source.save(
                    update_fields=[
                        'discovery_plan',
                        'discovery_status',
                        'discovery_error',
                        'updated_at',
                    ],
                )
                return {
                    'ok': True,
                    'plan': plan,
                    'toc_subjects': [r.get('name') for r in toc_rows],
                    'toc_subject_count': len(toc_rows),
                    'fill_rounds': fill_rounds_run,
                    'missing_after_rounds': meta_missing_snapshots[-1] if meta_missing_snapshots else [],
                    'max_slices_applied': max_slices,
                }

            max_slices = _effective_max_slices(len(toc_rows))
            plan = _finalize_plan(accumulated, total, max_slices)
            if not plan:
                raise RuntimeError('Leerer Plan von KI erhalten.')

            source.discovery_plan = plan
            source.discovery_status = CurriculumSource.DISCOVERY_DONE
            source.discovery_error = ''
            source.save(
                update_fields=[
                    'discovery_plan',
                    'discovery_status',
                    'discovery_error',
                    'updated_at',
                ],
            )
            return {
                'ok': True,
                'plan': plan,
                'toc_subjects': [r.get('name') for r in toc_rows],
                'toc_subject_count': len(toc_rows),
                'fill_rounds': fill_rounds_run,
                'missing_after_rounds': [],
                'max_slices_applied': max_slices,
            }
        except Exception as exc:
            source.discovery_status = CurriculumSource.DISCOVERY_FAILED
            source.discovery_error = str(exc)[:8000]
            source.discovery_plan = []
            source.save(
                update_fields=[
                    'discovery_status',
                    'discovery_error',
                    'discovery_plan',
                    'updated_at',
                ],
            )
            return {'ok': False, 'error': source.discovery_error}
