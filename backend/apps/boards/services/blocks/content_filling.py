"""KI-Filling: aus Stichpunkten + Block-Slots → konkreter Block-Content.

Aufruf-Reihenfolge:
    plan = validate_plan(raw)
    spec = fill_plan_with_ai(plan)
    bundle = compose_board(spec, theme)

Der Pfad ist robust:
* fragt einen Provider nach `generate_block_contents(page_payload)`,
* fällt bei jedem Fehler / unvollständigem Output auf einen deterministischen
  Heuristik-Filler zurück, der aus Stichpunkten plausible Inhalte ableitet,
* validiert jeden Content gegen das Pydantic-Schema des Bausteins; ist die
  AI-Antwort ungültig, greift erneut die Heuristik.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from apps.ai.providers.factory import get_provider

from .registry import BLOCK_BY_ID
from .validators import (
    BlockInstanceSpec,
    BlockSlotSpec,
    CompositionPlan,
    CompositionSpec,
    PageSpec,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Heuristische Default-Filler (Fallback)
# ---------------------------------------------------------------------------
def _short(text: str, n: int) -> str:
    text = (text or '').strip()
    return text[:n]


def _from_bullets(bullets: list[str], default: str = '') -> tuple[str, list[str]]:
    """Erste Bullet als Headline, Rest als Body-Quelle."""
    cleaned = [b for b in (bullets or []) if b.strip()]
    head = cleaned[0] if cleaned else default
    rest = cleaned[1:] if cleaned else []
    return head, rest


def _heuristic_textkarte(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    head, rest = _from_bullets(bullets, 'Wichtige Information')
    body = ' '.join(rest) if rest else (slot.hint or 'Erklärung folgt.')
    return {
        'title': _short(head, 160),
        'body': _short(body, 600),
        'merksatz': _short(slot.hint, 300),
    }


def _heuristic_aufdeckkarte(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    head, rest = _from_bullets(bullets, 'Frage')
    return {
        'front': _short(head, 200),
        'back': _short(' '.join(rest) or slot.hint or 'Antwort hier.', 400),
        'hint': '',
    }


def _heuristic_schritt(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    head, rest = _from_bullets(bullets, 'Ablauf')
    src = rest if rest else [slot.hint or 'Schritt 1', 'Schritt 2', 'Schritt 3']
    while len(src) < 2:
        src.append(f'Schritt {len(src) + 1}')
    src = src[:8]
    return {
        'title': _short(head, 160),
        'steps': [{'title': f'Schritt {i + 1}', 'body': _short(s, 400)} for i, s in enumerate(src)],
    }


def _heuristic_multiple_choice(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    question, rest = _from_bullets(bullets, 'Frage zum Thema?')
    pool = rest if rest else [slot.hint or 'Antwort A', 'Antwort B', 'Antwort C']
    while len(pool) < 2:
        pool.append(f'Antwort {chr(65 + len(pool))}')
    pool = pool[:4]
    options = [{'text': _short(t, 180), 'correct': i == 0} for i, t in enumerate(pool)]
    return {'question': _short(question, 240), 'options': options, 'explanation': ''}


def _heuristic_richtig_falsch(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    title, rest = _from_bullets(bullets, 'Richtig oder falsch?')
    src = rest if rest else [slot.hint or 'Aussage A', 'Aussage B']
    while len(src) < 2:
        src.append(f'Aussage {len(src) + 1}')
    return {
        'title': _short(title, 160),
        'statements': [{'text': _short(t, 240), 'correct': i % 2 == 0} for i, t in enumerate(src[:8])],
    }


def _heuristic_sortier(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    title, rest = _from_bullets(bullets, 'In die richtige Reihenfolge')
    items = rest if rest else [slot.hint or 'Erstens', 'Zweitens', 'Drittens']
    while len(items) < 3:
        items.append(f'Schritt {len(items) + 1}')
    return {'title': _short(title, 160), 'items': [_short(t, 120) for t in items[:8]]}


def _heuristic_zuordnung(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    title, rest = _from_bullets(bullets, 'Ordne richtig zu')
    pool = rest if rest else ['Begriff A | Bedeutung A', 'Begriff B | Bedeutung B']
    pairs = []
    for line in pool[:6]:
        if '|' in line:
            l, r = line.split('|', 1)
        elif '–' in line:
            l, r = line.split('–', 1)
        else:
            parts = line.split(':', 1)
            l, r = (parts[0], parts[1]) if len(parts) == 2 else (line, line)
        pairs.append({'left': _short(l.strip(), 120), 'right': _short(r.strip(), 180)})
    while len(pairs) < 2:
        pairs.append({'left': f'Begriff {len(pairs) + 1}', 'right': f'Bedeutung {len(pairs) + 1}'})
    return {'title': _short(title, 160), 'pairs': pairs}


def _heuristic_lueckentext(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    title, rest = _from_bullets(bullets, 'Setze die Wörter ein')
    src = rest if rest else [slot.hint or 'Die Sonne scheint hell.', 'Im Winter fällt Schnee.']
    sentences = []
    extras: list[str] = []
    for line in src[:5]:
        words = line.split()
        if not words:
            continue
        idx = max(0, len(words) // 2)
        answer = words[idx].strip(',.;:!?')
        words[idx] = '___'
        sentences.append({'text': ' '.join(words), 'answer': answer or 'Wort'})
    while len(sentences) < 1:
        sentences.append({'text': 'Setze hier ein ___ Wort ein.', 'answer': 'passendes'})
    return {'title': _short(title, 160), 'sentences': sentences, 'extra_words': extras}


def _heuristic_wortarten(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    title, rest = _from_bullets(bullets, 'Markiere die Wortarten')
    sentence = rest[0] if rest else (slot.hint or 'Der kleine Hund läuft schnell durch den Park.')
    words = sentence.split()
    solution: dict[str, str] = {}
    for w in words:
        clean = w.strip(',.;:!?')
        if not clean:
            continue
        # einfache, sichere Default-Heuristik: erstes-Wort-groß → Nomen, sonst sonstiges
        solution[clean] = 'nomen' if clean[:1].isupper() and clean.lower() not in {'der', 'die', 'das'} else 'sonstiges'
    return {'title': _short(title, 160), 'sentence': sentence, 'solution': solution}


def _heuristic_pro_contra(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    title, rest = _from_bullets(bullets, 'Pro & Contra')
    src = rest if rest else [slot.hint or 'Argument 1', 'Argument 2', 'Argument 3', 'Argument 4']
    while len(src) < 4:
        src.append(f'Argument {len(src) + 1}')
    return {
        'title': _short(title, 160),
        'arguments': [{'text': _short(t, 200), 'side': 'pro' if i % 2 == 0 else 'contra'} for i, t in enumerate(src[:10])],
    }


def _heuristic_chart(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    title, rest = _from_bullets(bullets, 'Verteilung')
    entries: list[dict[str, Any]] = []
    default_lines = ['Mo 4', 'Di 7', 'Mi 5', 'Do 9', 'Fr 3']
    source_lines = rest if rest else default_lines
    pool: list[str] = []
    for line in source_lines:
        line = str(line).strip()
        if not line:
            continue
        if ',' in line:
            pool.extend(p.strip() for p in line.split(',') if p.strip())
        else:
            pool.append(line)
    if not pool:
        pool = list(default_lines)
    for line in pool[:12]:
        parts = line.replace(':', ' ').split()
        if len(parts) >= 2:
            try:
                entries.append({'label': _short(parts[0], 40), 'value': float(parts[-1])})
                continue
            except ValueError:
                pass
        entries.append({'label': _short(line, 40), 'value': float(len(entries) + 1)})
    while len(entries) < 2:
        entries.append({'label': f'X{len(entries)}', 'value': float(len(entries) + 1)})
    return {
        'title': _short(title, 160),
        'x_label': 'Kategorie',
        'y_label': 'Wert',
        'entries': entries,
    }


def _heuristic_zahlenstrahl(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    title, _ = _from_bullets(bullets, 'Wo liegt die Zahl?')
    nums: list[float] = []
    for raw in (bullets or []) + [slot.hint]:
        for tok in (raw or '').replace(',', ' ').split():
            try:
                nums.append(float(tok))
            except ValueError:
                continue
    lo, hi = (min(nums), max(nums)) if nums else (0.0, 100.0)
    if hi <= lo:
        hi = lo + 100
    target = nums[0] if nums else (lo + hi) / 2
    return {
        'title': _short(title, 160),
        'min': lo,
        'max': hi,
        'step': max(1.0, round((hi - lo) / 50)),
        'target': target,
        'show_target': False,
        'markers': [lo, (lo + hi) / 2, hi],
    }


_HEURISTICS = {
    'textkarte': _heuristic_textkarte,
    'aufdeckkarte': _heuristic_aufdeckkarte,
    'schritt': _heuristic_schritt,
    'multiple_choice': _heuristic_multiple_choice,
    'richtig_falsch': _heuristic_richtig_falsch,
    'sortier': _heuristic_sortier,
    'zuordnung': _heuristic_zuordnung,
    'lueckentext': _heuristic_lueckentext,
    'wortarten': _heuristic_wortarten,
    'pro_contra': _heuristic_pro_contra,
    'balken_chart': _heuristic_chart,
    'linien_chart': _heuristic_chart,
    'zahlenstrahl': _heuristic_zahlenstrahl,
}


def _fallback_content(slot: BlockSlotSpec, bullets: list[str]) -> dict[str, Any]:
    fn = _HEURISTICS.get(slot.block_id)
    if fn is None:
        defn = BLOCK_BY_ID.get(slot.block_id)
        return dict(defn.default_content) if defn else {}
    return fn(slot, list(bullets))


def _validated_or_fallback(
    slot: BlockSlotSpec,
    candidate: Any,
    bullets: list[str],
) -> tuple[dict[str, Any], list[str]]:
    """Versucht den AI-Content zu nehmen; bei Schema-Fehler greift die Heuristik."""
    defn = BLOCK_BY_ID.get(slot.block_id)
    if defn is None:
        return {}, [f'Unbekannter Baustein "{slot.block_id}".']
    notes: list[str] = []
    if isinstance(candidate, dict):
        try:
            ok = defn.content_schema.model_validate(candidate)
            return ok.model_dump(mode='python'), notes
        except Exception as exc:  # noqa: BLE001
            notes.append(f'AI-Content für {slot.block_id} ungültig: {exc}; Heuristik greift.')
    fb = _fallback_content(slot, bullets)
    try:
        ok = defn.content_schema.model_validate(fb)
        return ok.model_dump(mode='python'), notes
    except Exception as exc:  # noqa: BLE001
        notes.append(f'Heuristik für {slot.block_id} ungültig ({exc}); Default-Content.')
        try:
            ok = defn.content_schema.model_validate(defn.default_content)
            return ok.model_dump(mode='python'), notes
        except Exception:  # noqa: BLE001
            return dict(defn.default_content), notes


# ---------------------------------------------------------------------------
# Provider-Aufruf
# ---------------------------------------------------------------------------
def _normalize_provider_block_fill(raw: dict[str, Any]) -> dict[str, Any]:
    """Einheitliches Mapping instance_id → content (KI darf slot_contents-Array oder flache Map liefern)."""
    sc = raw.get('slot_contents')
    if isinstance(sc, list):
        out: dict[str, Any] = {}
        for row in sc:
            if not isinstance(row, dict):
                continue
            iid = str(row.get('instance_id') or '').strip()
            if not iid:
                continue
            content = row.get('content')
            if isinstance(content, dict):
                out[iid] = content
        if out:
            return out
    reserved = {'slot_contents', 'warnings', 'notes', 'commentary'}
    return {k: v for k, v in raw.items() if k not in reserved and isinstance(v, dict)}


def _provider_fill_page(plan: CompositionPlan, page_idx: int) -> dict[str, Any]:
    """Fragt einen Provider nach Inhalten für eine Seite. Liefert {instance_id: content} oder {}."""
    page = plan.pages[page_idx]
    payload = {
        'subject': plan.subject,
        'grade': plan.grade,
        'topic': plan.topic,
        'title': plan.title,
        'style_hint': plan.style_hint,
        'page_index': page_idx,
        'page_title': page.title,
        'bullets': list(page.bullets),
        'slots': [
            {
                'instance_id': s.instance_id,
                'block_id': s.block_id,
                'hint': s.hint,
                'schema': BLOCK_BY_ID[s.block_id].content_schema.model_json_schema()
                if s.block_id in BLOCK_BY_ID else {},
            }
            for s in page.block_slots
        ],
    }
    provider = get_provider()
    method = getattr(provider, 'generate_block_contents', None)
    if method is None:
        return {}
    try:
        raw = method(payload)
    except Exception:  # noqa: BLE001
        logger.exception('Block-Content-Provider warf Fehler — Fallback aktiv.')
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning('Block-Content-Provider lieferte ungültiges JSON.')
            return {}
    if not isinstance(raw, dict):
        return {}
    return _normalize_provider_block_fill(raw)


# ---------------------------------------------------------------------------
# Public: Plan -> Spec
# ---------------------------------------------------------------------------
def fill_plan_with_ai(plan: CompositionPlan) -> tuple[CompositionSpec, list[str]]:
    """Wandelt einen Plan in eine Spec um, indem die KI (oder Heuristik) Inhalte erzeugt."""
    notes: list[str] = []
    spec_pages: list[PageSpec] = []

    for p_idx, page in enumerate(plan.pages):
        ai_map = _provider_fill_page(plan, p_idx)
        blocks: list[BlockInstanceSpec] = []
        for slot in page.block_slots:
            candidate = ai_map.get(slot.instance_id)
            content, n = _validated_or_fallback(slot, candidate, page.bullets)
            notes.extend(n)
            blocks.append(BlockInstanceSpec(
                instance_id=slot.instance_id,
                block_id=slot.block_id,
                content=content,
            ))
        spec_pages.append(PageSpec(title=page.title, blocks=blocks))

    description = ''
    if plan.pages and plan.pages[0].bullets:
        description = ' · '.join(plan.pages[0].bullets[:3])
    spec = CompositionSpec(
        subject=plan.subject,
        grade=plan.grade,
        topic=plan.topic,
        title=plan.title,
        description=description,
        theme_id=plan.theme_id,
        pages=spec_pages,
    )
    return spec, notes


__all__ = ['fill_plan_with_ai']
