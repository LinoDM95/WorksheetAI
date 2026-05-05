from rest_framework import serializers
import copy

from django.conf import settings

from .models import Worksheet
from .services.render_model import build_render_model
from .services.content_blocks import apply_page_coalesce_to_content, apply_page_overflow_reflow

import logging

logger = logging.getLogger(__name__)


def build_curriculum_usage_payload(worksheet: Worksheet) -> dict:
    usage_qs = getattr(worksheet, 'curriculum_usages', None)
    latest = usage_qs.order_by('-created_at').first() if usage_qs is not None else None
    meta = worksheet.generation_meta if isinstance(worksheet.generation_meta, dict) else {}
    warning = meta.get('curriculum_warning')

    if latest:
        tv = latest.teacher_visible_summary if isinstance(latest.teacher_visible_summary, dict) else {}
        panel = {
            'state': tv.get('state'),
            'subject': tv.get('subject'),
            'grade_band': tv.get('grade_band'),
            'topic_area': tv.get('topic_area'),
            'subtopics': tv.get('subtopics') or [],
            'competency_goals': tv.get('competency_goals') or [],
            'allowed_task_types': tv.get('allowed_task_types') or [],
            'validation_rules': tv.get('validation_rules') or [],
            'sources': tv.get('sources') or [],
            'quality_status': tv.get('quality_status'),
            'match_reasons': tv.get('match_reasons') or latest.match_reasons or [],
            'match_score': tv.get('match_score', latest.match_score),
            'ai_usage_note': latest.ai_usage_note or '',
            'curriculum_alignment': latest.curriculum_alignment if isinstance(latest.curriculum_alignment, dict) else {},
            'title': tv.get('title'),
            'short_description': tv.get('short_description'),
            'source_label': tv.get('source_label'),
        }
        return {'has_curriculum_context': True, 'usage': panel}

    return {
        'has_curriculum_context': False,
        'usage': None,
        'warning': str(warning) if warning else (
            'Für dieses Arbeitsblatt wurde kein aktiver Lehrplan-Kontext gefunden oder genutzt.'
        ),
    }

class WorksheetSerializer(serializers.ModelSerializer):
    pattern_name = serializers.CharField(source='pattern.name', read_only=True)
    curriculum_warning = serializers.SerializerMethodField()
    curriculum_show_usage = serializers.SerializerMethodField()
    curriculum_usage_panel = serializers.SerializerMethodField()

    class Meta:
        model=Worksheet
        fields=['id','title','subject','grade','topic','page_setup','content','render_model','status',
                'generation_meta','pattern','pattern_name','created_at','updated_at',
                'curriculum_warning','curriculum_show_usage','curriculum_usage_panel']
        read_only_fields=['owner','created_at','updated_at','generation_meta']

    @staticmethod
    def get_curriculum_warning(obj: Worksheet) -> str | None:
        meta = obj.generation_meta if isinstance(obj.generation_meta, dict) else {}
        w = meta.get('curriculum_warning')
        return str(w) if w else None

    @staticmethod
    def get_curriculum_show_usage(obj: Worksheet) -> bool:
        return bool(getattr(settings, 'CURRICULUM_SHOW_USAGE_TO_TEACHERS', True))

    @staticmethod
    def get_curriculum_usage_panel(obj: Worksheet) -> dict:
        return build_curriculum_usage_payload(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        req = {
            'theme': (instance.render_model or {}).get('theme', 'neutral'),
            'creativity': (instance.render_model or {}).get('creativity', 'balanced'),
        }
        content = instance.content if isinstance(instance.content, dict) else {}
        rm_existing = data.get('render_model')
        if self._render_model_usable(rm_existing):
            return data

        try:
            data['render_model'] = build_render_model(
                content,
                instance.page_setup,
                instance.pattern,
                req,
            )
        except Exception as exc:
            logger.warning('render_model Neuaufbau fehlgeschlagen, nutze gespeichertes Modell: %s', exc)
            if isinstance(instance.render_model, dict) and instance.render_model:
                data['render_model'] = instance.render_model
            else:
                data['render_model'] = {'version': 'fallback', 'pages': [], 'solutions': []}
        return data

    @staticmethod
    def _render_model_usable(rm) -> bool:
        """Gespeichertes Modell aus der DB — vermeidet teuren Neuaufbau bei jedem GET (große Blätter)."""
        if not isinstance(rm, dict):
            return False
        pages = rm.get('pages')
        return isinstance(pages, list) and len(pages) > 0

    def update(self, instance, validated_data):
        content = validated_data.get('content')
        if isinstance(content, dict):
            c = copy.deepcopy(content)
            c, _ = apply_page_coalesce_to_content(c)
            c, _ = apply_page_overflow_reflow(c)
            validated_data['content'] = c
        instance = super().update(instance, validated_data)
        if 'content' in validated_data:
            req={
                'theme':(instance.render_model or {}).get('theme','neutral'),
                'creativity':(instance.render_model or {}).get('creativity','balanced'),
            }
            instance.render_model=build_render_model(
                instance.content,
                instance.page_setup,
                instance.pattern,
                req,
            )
            ct=instance.content.get('title') if isinstance(instance.content,dict) else None
            if ct:
                instance.title=str(ct)[:255]
            instance.save(update_fields=['render_model','title','updated_at'])
        return instance
