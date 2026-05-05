"""DRF Serializer für Curricula."""
from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from apps.curricula.models import (
    CurriculumContext,
    CurriculumExtractionJob,
    CurriculumRule,
    CurriculumSource,
)
from apps.curricula.states import (
    BERLIN_BRANDENBURG_DISPLAY,
    is_known_state,
    normalize_replicate,
    resolve_state,
)


def _max_upload_bytes() -> int:
    mb = getattr(settings, 'CURRICULUM_MAX_SOURCE_UPLOAD_MB', 50)
    return int(mb) * 1024 * 1024


class CurriculumSourceSerializer(serializers.ModelSerializer):
    jobs_count = serializers.SerializerMethodField()
    contexts_count = serializers.SerializerMethodField()

    class Meta:
        model = CurriculumSource
        fields = [
            'id',
            'title',
            'state',
            'country',
            'document_type',
            'subject',
            'version',
            'year',
            'file',
            'page_count',
            'extracted_pages',
            'extraction_status',
            'extraction_error',
            'discovery_status',
            'discovery_plan',
            'discovery_error',
            'replicate_states',
            'auto_run_id',
            'created_by',
            'created_at',
            'updated_at',
            'page_images_generated',
            'page_preview_paths',
            'jobs_count',
            'contexts_count',
        ]
        read_only_fields = [
            'id',
            'file',
            'page_count',
            'extracted_pages',
            'extraction_status',
            'extraction_error',
            'discovery_status',
            'discovery_plan',
            'discovery_error',
            'auto_run_id',
            'created_at',
            'updated_at',
            'page_images_generated',
            'page_preview_paths',
            'jobs_count',
            'contexts_count',
        ]

    def get_jobs_count(self, obj: CurriculumSource) -> int:
        return obj.jobs.count()

    def get_contexts_count(self, obj: CurriculumSource) -> int:
        return obj.contexts.count()

    def validate_file(self, value):
        if value.size > _max_upload_bytes():
            raise serializers.ValidationError(
                f'Datei zu groß (max. {getattr(settings, "CURRICULUM_MAX_SOURCE_UPLOAD_MB", 50)} MB).'
            )
        if not value.name.lower().endswith('.pdf'):
            raise serializers.ValidationError('Nur PDF-Dateien sind erlaubt.')
        return value


class CurriculumSourceCreateSerializer(serializers.ModelSerializer):
    state_slug = serializers.CharField(required=False, allow_blank=True, write_only=True)
    replicate_states = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = CurriculumSource
        fields = [
            'title',
            'state',
            'state_slug',
            'replicate_states',
            'country',
            'document_type',
            'subject',
            'version',
            'year',
            'file',
        ]
        extra_kwargs = {
            'title': {'required': False, 'allow_blank': True},
            'state': {'required': False, 'allow_blank': True},
        }

    def validate_file(self, value):
        if value.size > _max_upload_bytes():
            raise serializers.ValidationError(
                f'Datei zu groß (max. {getattr(settings, "CURRICULUM_MAX_SOURCE_UPLOAD_MB", 50)} MB).'
            )
        if not value.name.lower().endswith('.pdf'):
            raise serializers.ValidationError('Nur PDF-Dateien sind erlaubt.')
        return value

    def validate(self, attrs):
        state_slug = attrs.pop('state_slug', '') or ''
        state_value = attrs.get('state') or ''
        replicate_in = attrs.get('replicate_states') or []
        chosen_raw = state_slug or state_value
        if not chosen_raw.strip():
            raise serializers.ValidationError({'state': 'Bundesland ist erforderlich.'})
        display, replicate_from_slug = resolve_state(chosen_raw)
        if not display:
            raise serializers.ValidationError({'state': 'Unbekanntes Bundesland.'})
        if not is_known_state(chosen_raw):
            raise serializers.ValidationError({'state': 'Bitte gültiges Bundesland auswählen.'})
        attrs['state'] = display
        replicate_final = normalize_replicate(replicate_in) if replicate_in else replicate_from_slug
        attrs['replicate_states'] = replicate_final
        return attrs

    def create(self, validated_data):
        user = self.context['request'].user
        if user.is_authenticated:
            validated_data['created_by'] = user
        title = (validated_data.get('title') or '').strip()
        state = validated_data.get('state') or ''
        doc_type = validated_data.get('document_type') or CurriculumSource.DOCUMENT_OTHER
        if not title:
            display_map = dict(CurriculumSource.DOCUMENT_TYPE_CHOICES)
            label = display_map.get(doc_type, doc_type)
            replicate = validated_data.get('replicate_states') or []
            if replicate:
                state_label = ' & '.join(replicate)
            else:
                state_label = state or '—'
            validated_data['title'] = f'{state_label} · {label}'
        return super().create(validated_data)


class CurriculumExtractionJobSerializer(serializers.ModelSerializer):
    source_title = serializers.CharField(source='source.title', read_only=True)

    class Meta:
        model = CurriculumExtractionJob
        fields = [
            'id',
            'source',
            'source_title',
            'state',
            'subject',
            'grade_band',
            'level_band',
            'topic_hint',
            'page_start',
            'page_end',
            'selected_pages',
            'status',
            'prompt_text',
            'ai_raw_output',
            'extracted_context',
            'validation_errors',
            'review_status',
            'review_notes',
            'reviewed_by',
            'reviewed_at',
            'source_excerpt',
            'extraction_summary',
            'auto_run_id',
            'plan_index',
            'created_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'status',
            'prompt_text',
            'ai_raw_output',
            'extracted_context',
            'validation_errors',
            'review_status',
            'review_notes',
            'reviewed_by',
            'reviewed_at',
            'source_excerpt',
            'extraction_summary',
            'auto_run_id',
            'plan_index',
            'created_at',
            'updated_at',
        ]

    def create(self, validated_data):
        user = self.context['request'].user
        if user.is_authenticated:
            validated_data['created_by'] = user
        return super().create(validated_data)


class CurriculumContextSerializer(serializers.ModelSerializer):
    source_title = serializers.CharField(source='source.title', read_only=True)

    class Meta:
        model = CurriculumContext
        fields = [
            'id',
            'state',
            'country',
            'curriculum_version',
            'source',
            'source_title',
            'extraction_job',
            'subject',
            'grade_band',
            'level_band',
            'topic_area',
            'subtopics',
            'competency_goals',
            'knowledge_goals',
            'skills',
            'allowed_task_types',
            'recommended_worksheet_formats',
            'language_guidance',
            'media_guidance',
            'cross_curricular_links',
            'validation_rules',
            'difficulty_notes',
            'source_refs',
            'status',
            'quality_status',
            'public_summary',
            'teacher_facing_summary',
            'created_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'source_title']


class CurriculumRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = CurriculumRule
        fields = '__all__'


class CurriculumMatchRequestSerializer(serializers.Serializer):
    state = serializers.CharField()
    subject = serializers.CharField()
    grade = serializers.IntegerField(required=False, allow_null=True)
    topic = serializers.CharField(required=False, default='')


class CurriculumApproveSerializer(serializers.Serializer):
    edited_context = serializers.JSONField(required=False)
    activate = serializers.BooleanField(default=False)


class CurriculumRejectSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, default='')


class CurriculumAutoExtractRequestSerializer(serializers.Serializer):
    selected_indices = serializers.ListField(
        child=serializers.IntegerField(min_value=0),
        required=False,
        default=list,
    )


class CurriculumAutoApproveSerializer(serializers.Serializer):
    activate = serializers.BooleanField(default=True)
    replicate_states = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
    )
    skip_indices = serializers.ListField(
        child=serializers.IntegerField(min_value=0),
        required=False,
        default=list,
    )
    edited_contexts = serializers.DictField(
        child=serializers.JSONField(),
        required=False,
        default=dict,
    )


class CurriculumJobCreateSerializer(serializers.Serializer):
    source_id = serializers.UUIDField()
    state = serializers.CharField(max_length=120)
    subject = serializers.CharField(max_length=120)
    grade_band = serializers.CharField(max_length=60)
    level_band = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    topic_hint = serializers.CharField(max_length=220, required=False, default='')
    page_start = serializers.IntegerField(required=False, allow_null=True)
    page_end = serializers.IntegerField(required=False, allow_null=True)
    selected_pages = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
