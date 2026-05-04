from rest_framework import serializers
import copy

from .models import Worksheet
from .services.render_model import build_render_model
from .services.content_blocks import apply_page_coalesce_to_content, apply_page_overflow_reflow


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
        data['render_model'] = build_render_model(
            instance.content,
            instance.page_setup,
            instance.pattern,
            req,
        )
        return data

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
