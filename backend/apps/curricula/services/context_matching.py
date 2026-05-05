"""Matching Wizard-/Generator-Parameter zu aktiven CurriculumContexts."""
from __future__ import annotations

import re
from typing import Any

from apps.curricula.models import CurriculumContext


def _norm(s: str) -> str:
    return (s or '').strip().lower()


def _parse_grade_band(band: str) -> tuple[int | None, int | None]:
    b = (band or '').strip()
    m = re.match(r'^(\d+)\s*[-–]\s*(\d+)$', b)
    if m:
        return int(m.group(1)), int(m.group(2))
    m2 = re.match(r'^(\d+)$', b)
    if m2:
        v = int(m2.group(1))
        return v, v
    return None, None


def _grade_in_band(grade: int | None, band: str) -> bool:
    if grade is None:
        return True
    lo, hi = _parse_grade_band(band)
    if lo is None or hi is None:
        return True
    return lo <= grade <= hi


def _keyword_hits(topic: str, ctx: CurriculumContext) -> int:
    if not topic:
        return 0
    tokens = [t for t in re.split(r'\W+', _norm(topic)) if len(t) > 2]
    hay = _norm(ctx.topic_area) + ' ' + ' '.join(_norm(s) for s in (ctx.subtopics or []))
    score = 0
    for t in tokens:
        if t in hay:
            score += 2
    return score


class CurriculumContextMatchingService:
    @staticmethod
    def compact_context_for_prompt(ctx: CurriculumContext) -> dict[str, Any]:
        return {
            'state': ctx.state,
            'curriculum_version': ctx.curriculum_version or None,
            'subject': ctx.subject,
            'grade_band': ctx.grade_band,
            'level_band': list(ctx.level_band or []),
            'topic_area': ctx.topic_area,
            'subtopics': list(ctx.subtopics or []),
            'competency_goals': list(ctx.competency_goals or []),
            'knowledge_goals': list(ctx.knowledge_goals or []),
            'skills': list(ctx.skills or []),
            'allowed_task_types': list(ctx.allowed_task_types or []),
            'recommended_worksheet_formats': list(ctx.recommended_worksheet_formats or []),
            'language_guidance': ctx.language_guidance if isinstance(ctx.language_guidance, dict) else {},
            'media_guidance': list(ctx.media_guidance or []),
            'cross_curricular_links': list(ctx.cross_curricular_links or []),
            'validation_rules': list(ctx.validation_rules or []),
            'difficulty_notes': list(ctx.difficulty_notes or []),
            'source_refs': list(ctx.source_refs or []),
            'public_summary': (ctx.public_summary or '')[:2000],
            'quality_status': ctx.quality_status,
        }

    @classmethod
    def find_best_contexts(
        cls,
        *,
        state: str,
        subject: str,
        grade: int | None,
        topic: str,
        limit: int = 3,
    ) -> list[dict[str, Any]]:
        state_n = _norm(state)
        subj_n = _norm(subject)

        qs = CurriculumContext.objects.filter(status=CurriculumContext.STATUS_ACTIVE)
        candidates = []
        for ctx in qs:
            reasons: list[str] = []
            score = 0.0
            if state_n and _norm(ctx.state) == state_n:
                score += 3
                reasons.append('Bundesland passt.')
            elif state_n:
                score += 0.5
                reasons.append('Bundesland weicht ab — Kontext ggf. nur ähnlich.')

            if subj_n and _norm(ctx.subject) == subj_n:
                score += 3
                reasons.append(f'Fach {ctx.subject} passt.')
            elif subj_n and subj_n in _norm(ctx.subject):
                score += 2
                reasons.append('Fachteilweise Übereinstimmung.')

            if grade is not None and _grade_in_band(grade, ctx.grade_band):
                score += 2
                reasons.append(f'Klassenstufe liegt im Band {ctx.grade_band}.')
            elif grade is not None:
                reasons.append(f'Klassenstufe liegt möglicherweise außerhalb von {ctx.grade_band}.')

            kw = _keyword_hits(topic, ctx)
            score += min(kw, 4)
            if kw > 0:
                reasons.append('Thema passt zu Themenfeld/Unterthemen.')

            if ctx.quality_status == CurriculumContext.QUALITY_HUMAN:
                score += 0.5
                reasons.append('Manuell geprüfter Kontext.')

            candidates.append({'context': ctx, 'score': score, 'reasons': reasons})

        candidates.sort(key=lambda x: x['score'], reverse=True)
        return candidates[:limit]

    @staticmethod
    def build_teacher_visible_usage(
        ctx: CurriculumContext,
        *,
        match_score: float,
        match_reasons: list[str],
        curriculum_alignment: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        tf = ctx.teacher_facing_summary if isinstance(ctx.teacher_facing_summary, dict) else {}
        sources: list[dict[str, Any]] = []
        pages_acc: list[int] = []
        for ref in ctx.source_refs or []:
            if not isinstance(ref, dict):
                continue
            pg = ref.get('page')
            doc = ref.get('document') or ''
            if pg is not None:
                try:
                    pages_acc.append(int(pg))
                except (TypeError, ValueError):
                    pass
            sources.append(
                {
                    'document': doc,
                    'pages': [int(pg)] if pg is not None else [],
                    'label': ref.get('note') or doc or '',
                },
            )
        if pages_acc:
            lo, hi = min(pages_acc), max(pages_acc)
            label = f'{ctx.source.title if ctx.source_id else "Quelle"}, Seiten {lo}' + (
                f'–{hi}' if hi != lo else ''
            )
        else:
            label = tf.get('source_label') or ''

        out = {
            'state': ctx.state,
            'subject': ctx.subject,
            'grade_band': ctx.grade_band,
            'topic_area': ctx.topic_area,
            'subtopics': list(ctx.subtopics or []),
            'competency_goals': list(ctx.competency_goals or []),
            'allowed_task_types': list(ctx.allowed_task_types or []),
            'validation_rules': list(ctx.validation_rules or []),
            'sources': sources,
            'quality_status': ctx.quality_status,
            'match_score': match_score,
            'match_reasons': list(match_reasons or []),
            'title': tf.get('title') or f'{ctx.subject} · {ctx.grade_band}',
            'short_description': tf.get('short_description') or ctx.public_summary or '',
            'source_label': label,
        }
        if curriculum_alignment:
            out['curriculum_alignment'] = curriculum_alignment
        return out
