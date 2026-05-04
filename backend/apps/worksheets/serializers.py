from rest_framework import serializers
import copy

from .models import Worksheet
from .services.render_model import build_render_model
from .services.content_blocks import apply_page_coalesce_to_content, apply_page_overflow_reflow

import logging

logger = logging.getLogger(__name__)


class WorksheetSerializer(serializers.ModelSerializer):
    pattern_name = serializers.CharField(source='pattern.name', read_only=True)
    class Meta:
        model=Worksheet
        fields=['id','title','subject','grade','topic','page_setup','content','render_model','status','pattern','pattern_name','created_at','updated_at']
        read_only_fields=['owner','created_at','updated_at']

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
