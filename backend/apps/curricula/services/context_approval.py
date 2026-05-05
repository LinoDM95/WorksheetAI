"""Genehmigung eines Extraktionsjobs zu CurriculumContext."""
from __future__ import annotations

import uuid
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.curricula.models import CurriculumContext, CurriculumExtractionJob, CurriculumSource
from apps.curricula.services.schemas import CurriculumContextSchema
from apps.curricula.states import normalize_replicate


class CurriculumContextApprovalService:
    @classmethod
    def approve_job(
        cls,
        job: CurriculumExtractionJob,
        *,
        edited_context: dict[str, Any] | None = None,
        activate: bool = False,
        reviewer=None,
    ) -> CurriculumContext:
        raw = edited_context if isinstance(edited_context, dict) and edited_context else job.extracted_context
        if not isinstance(raw, dict):
            raw = {}
        model = CurriculumContextSchema.model_validate(raw)
        errs = model.normalized_errors()
        if errs:
            raise ValueError('; '.join(errs))

        if activate and 'MOCK' in str(model.topic_area).upper():
            raise ValueError('MOCK-Kontexte dürfen nicht aktiviert werden.')

        require_review = getattr(settings, 'CURRICULUM_REQUIRE_HUMAN_REVIEW', True)
        if activate and require_review and reviewer is None:
            raise ValueError('Ohne Reviewer darf nicht aktiviert werden (CURRICULUM_REQUIRE_HUMAN_REVIEW=true).')

        ctx_dict = model.to_context_dict(document_title=job.source.title if job.source_id else '')
        tf = ctx_dict.get('teacher_facing_summary') or {}

        status = CurriculumContext.STATUS_ACTIVE if activate else CurriculumContext.STATUS_DRAFT
        ctx = CurriculumContext.objects.create(
            state=model.state or job.state,
            country='DE',
            curriculum_version=model.curriculum_version or '',
            source=job.source,
            extraction_job=job,
            subject=model.subject,
            grade_band=model.grade_band,
            level_band=model.level_band,
            topic_area=model.topic_area,
            subtopics=model.subtopics,
            competency_goals=model.competency_goals,
            knowledge_goals=model.knowledge_goals,
            skills=model.skills,
            allowed_task_types=model.allowed_task_types,
            recommended_worksheet_formats=model.recommended_worksheet_formats,
            language_guidance=model.language_guidance or {},
            media_guidance=model.media_guidance,
            cross_curricular_links=model.cross_curricular_links,
            validation_rules=model.validation_rules,
            difficulty_notes=model.difficulty_notes,
            source_refs=model.source_refs,
            status=status,
            quality_status=CurriculumContext.QUALITY_HUMAN,
            public_summary=model.public_summary or '',
            teacher_facing_summary=tf if isinstance(tf, dict) else {},
            created_by=reviewer or job.created_by,
        )

        job.status = CurriculumExtractionJob.STATUS_APPROVED
        job.review_status = CurriculumExtractionJob.REVIEW_DONE
        job.reviewed_by = reviewer
        job.reviewed_at = timezone.now()
        job.save(update_fields=['status', 'review_status', 'reviewed_by', 'reviewed_at', 'updated_at'])
        return ctx

    @classmethod
    def reject_job(cls, job: CurriculumExtractionJob, reviewer, notes: str = '') -> None:
        job.review_status = CurriculumExtractionJob.REVIEW_REJECTED
        job.review_notes = (notes or '')[:8000]
        job.reviewed_by = reviewer
        job.reviewed_at = timezone.now()
        job.save(update_fields=['review_status', 'review_notes', 'reviewed_by', 'reviewed_at', 'updated_at'])

    @classmethod
    def approve_run(
        cls,
        source: CurriculumSource,
        run_id: uuid.UUID | str,
        *,
        activate: bool = True,
        replicate_states: list[str] | None = None,
        skip_indices: list[int] | None = None,
        edited_contexts: dict[str, Any] | None = None,
        reviewer=None,
    ) -> dict[str, Any]:
        run_uuid = run_id if isinstance(run_id, uuid.UUID) else uuid.UUID(str(run_id))
        replicate = normalize_replicate(replicate_states or list(source.replicate_states or []))
        skip_set = {int(i) for i in (skip_indices or [])}
        edited = {str(k): v for k, v in (edited_contexts or {}).items() if isinstance(v, dict)}

        jobs = list(
            CurriculumExtractionJob.objects.filter(
                source=source,
                auto_run_id=run_uuid,
                status=CurriculumExtractionJob.STATUS_COMPLETED,
            ).order_by('plan_index'),
        )

        target_states: list[str] = replicate if replicate else [source.state]
        created_ids: list[str] = []
        skipped: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []

        for job in jobs:
            plan_idx = job.plan_index if job.plan_index is not None else -1
            if plan_idx in skip_set:
                skipped.append({'plan_index': plan_idx, 'reason': 'manuell übersprungen'})
                continue

            ctx_dict = edited.get(str(plan_idx)) or job.extracted_context
            if not isinstance(ctx_dict, dict):
                errors.append({'plan_index': plan_idx, 'error': 'extracted_context fehlt.'})
                continue

            try:
                model = CurriculumContextSchema.model_validate(ctx_dict)
            except Exception as exc:
                errors.append({'plan_index': plan_idx, 'error': f'Schema: {exc}'[:500]})
                continue

            errs = model.normalized_errors()
            if errs:
                errors.append({'plan_index': plan_idx, 'error': '; '.join(errs)[:500]})
                continue

            is_mock = 'MOCK' in str(model.topic_area).upper() or 'MOCK' in str(model.subject).upper()
            if activate and is_mock:
                skipped.append(
                    {
                        'plan_index': plan_idx,
                        'reason': 'MOCK-Kontext nicht aktiviert (nur Demo).',
                    },
                )
                continue

            require_review = getattr(settings, 'CURRICULUM_REQUIRE_HUMAN_REVIEW', True)
            if activate and require_review and reviewer is None:
                errors.append(
                    {
                        'plan_index': plan_idx,
                        'error': 'Aktivierung benötigt Reviewer (CURRICULUM_REQUIRE_HUMAN_REVIEW=true).',
                    },
                )
                continue

            ctx_payload = model.to_context_dict(document_title=source.title)
            tf = ctx_payload.get('teacher_facing_summary') or {}
            status = (
                CurriculumContext.STATUS_ACTIVE
                if (activate and not is_mock)
                else CurriculumContext.STATUS_DRAFT
            )

            with transaction.atomic():
                for st in target_states:
                    obj = CurriculumContext.objects.create(
                        state=st,
                        country='DE',
                        curriculum_version=model.curriculum_version or '',
                        source=source,
                        extraction_job=job,
                        subject=model.subject,
                        grade_band=model.grade_band,
                        level_band=model.level_band,
                        topic_area=model.topic_area,
                        subtopics=model.subtopics,
                        competency_goals=model.competency_goals,
                        knowledge_goals=model.knowledge_goals,
                        skills=model.skills,
                        allowed_task_types=model.allowed_task_types,
                        recommended_worksheet_formats=model.recommended_worksheet_formats,
                        language_guidance=model.language_guidance or {},
                        media_guidance=model.media_guidance,
                        cross_curricular_links=model.cross_curricular_links,
                        validation_rules=model.validation_rules,
                        difficulty_notes=model.difficulty_notes,
                        source_refs=model.source_refs,
                        status=status,
                        quality_status=CurriculumContext.QUALITY_HUMAN,
                        public_summary=model.public_summary or '',
                        teacher_facing_summary=tf if isinstance(tf, dict) else {},
                        created_by=reviewer or job.created_by,
                    )
                    created_ids.append(str(obj.id))

                job.status = CurriculumExtractionJob.STATUS_APPROVED
                job.review_status = CurriculumExtractionJob.REVIEW_DONE
                job.reviewed_by = reviewer
                job.reviewed_at = timezone.now()
                job.save(
                    update_fields=[
                        'status',
                        'review_status',
                        'reviewed_by',
                        'reviewed_at',
                        'updated_at',
                    ],
                )

        return {
            'ok': True,
            'run_id': str(run_uuid),
            'created': created_ids,
            'replicate_states': target_states if replicate else [],
            'skipped': skipped,
            'errors': errors,
        }
