"""Pydantic-Schema für kompakten Curriculum-Kontext (KI + Approval)."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class SourceRefSchema(BaseModel):
    document: str = ''
    source_id: str | None = None
    page: int | None = None
    note: str = ''
    excerpt: str = ''

    @field_validator('excerpt', mode='before')
    @classmethod
    def trim_excerpt(cls, v: Any) -> str:
        if v is None:
            return ''
        s = str(v).strip()
        return s[:300]


class TeacherFacingSummarySchema(BaseModel):
    title: str = ''
    short_description: str = ''
    used_for: list[str] = Field(default_factory=list)
    competency_highlights: list[str] = Field(default_factory=list)
    source_label: str = ''


class CurriculumContextSchema(BaseModel):
    state: str = ''
    curriculum_version: str | None = None
    subject: str = ''
    grade_band: str = ''
    level_band: list[str] = Field(default_factory=list)
    topic_area: str = ''
    subtopics: list[str] = Field(default_factory=list)
    competency_goals: list[str] = Field(default_factory=list)
    knowledge_goals: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    allowed_task_types: list[str] = Field(default_factory=list)
    recommended_worksheet_formats: list[str] = Field(default_factory=list)
    language_guidance: dict[str, Any] = Field(default_factory=dict)
    media_guidance: list[str] = Field(default_factory=list)
    cross_curricular_links: list[str] = Field(default_factory=list)
    validation_rules: list[str] = Field(default_factory=list)
    difficulty_notes: list[str] = Field(default_factory=list)
    source_refs: list[dict[str, Any]] = Field(default_factory=list)
    public_summary: str | None = None
    teacher_facing_summary: dict[str, Any] | None = None

    @field_validator(
        'subject',
        'grade_band',
        'topic_area',
        mode='before',
    )
    @classmethod
    def trim_required_strings(cls, v: Any) -> str:
        if v is None:
            return ''
        return str(v).strip()

    @staticmethod
    def _clean_str_list(xs: Any) -> list[str]:
        if not isinstance(xs, list):
            return []
        out: list[str] = []
        for x in xs:
            if x is None:
                continue
            s = str(x).strip()
            if s:
                out.append(s)
        return out

    @field_validator(
        'level_band',
        'subtopics',
        'competency_goals',
        'knowledge_goals',
        'skills',
        'allowed_task_types',
        'recommended_worksheet_formats',
        'media_guidance',
        'cross_curricular_links',
        'validation_rules',
        'difficulty_notes',
        mode='before',
    )
    @classmethod
    def clean_lists(cls, v: Any) -> list[str]:
        return cls._clean_str_list(v)

    @field_validator('source_refs', mode='before')
    @classmethod
    def clean_source_refs(cls, v: Any) -> list[dict[str, Any]]:
        if not isinstance(v, list):
            return []
        out: list[dict[str, Any]] = []
        for item in v:
            if not isinstance(item, dict):
                continue
            ref = SourceRefSchema.model_validate(item)
            out.append(ref.model_dump(exclude_none=True))
        return out

    def normalized_errors(self) -> list[str]:
        errs: list[str] = []
        if not self.subject:
            errs.append('subject darf nicht leer sein.')
        if not self.grade_band:
            errs.append('grade_band darf nicht leer sein.')
        if not self.topic_area:
            errs.append('topic_area darf nicht leer sein.')
        return errs

    def ensure_teacher_summary(self, document_title: str = '') -> dict[str, Any]:
        raw = self.teacher_facing_summary
        if isinstance(raw, dict) and raw.get('title'):
            return raw
        parts = [self.subject, f'Klassenband {self.grade_band}', self.topic_area]
        title = ' · '.join(p for p in parts if p)
        pages_note = ''
        if self.source_refs:
            pages = [r.get('page') for r in self.source_refs if isinstance(r, dict) and r.get('page') is not None]
            if pages:
                lo, hi = min(pages), max(pages)
                pages_note = f'{document_title or "Quelle"}, Seiten {lo}' + (f'–{hi}' if hi != lo else '')
        return {
            'title': title,
            'short_description': (self.public_summary or '').strip() or self.topic_area,
            'used_for': list(self.allowed_task_types)[:12],
            'competency_highlights': list(self.competency_goals)[:12],
            'source_label': pages_note or document_title or '',
        }

    def to_context_dict(self, document_title: str = '') -> dict[str, Any]:
        tf = self.ensure_teacher_summary(document_title=document_title)
        base = self.model_dump(exclude_none=True)
        base['teacher_facing_summary'] = tf
        return base
