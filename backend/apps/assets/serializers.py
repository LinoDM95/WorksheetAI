from __future__ import annotations

from rest_framework import serializers

from .models import AssetGenerationJob, AssetPack, GeneratedAsset


class GeneratedAssetSerializer(serializers.ModelSerializer):
    """Detail-Serializer für ein einzelnes Asset.

    Liefert das normalisierte SVG nicht im Listing-Modus mit (Größe).
    Nutze ``GeneratedAssetBriefSerializer`` für Pack-Listen.
    """

    download_url = serializers.SerializerMethodField()

    class Meta:
        model = GeneratedAsset
        fields = (
            'id', 'asset_pack', 'board',
            'key', 'title', 'description',
            'asset_type', 'subject_text', 'style_family',
            'strategy', 'priority', 'background_mode',
            'asset_spec',
            'svg', 'normalized_svg',
            'width', 'height', 'viewbox',
            'validation_errors', 'validation_warnings',
            'quality_report', 'quality_score', 'repair_history',
            'tags', 'metadata',
            'is_reusable', 'is_quality_example', 'usage_count',
            'download_url',
            'created_at', 'updated_at',
        )
        read_only_fields = fields

    def get_download_url(self, obj: GeneratedAsset) -> str:
        return f'/board-generated-assets/{obj.id}.svg'


class GeneratedAssetBriefSerializer(serializers.ModelSerializer):
    """Schlanker Serializer für Pack-Übersichten (kein SVG-Body)."""

    download_url = serializers.SerializerMethodField()

    class Meta:
        model = GeneratedAsset
        fields = (
            'id', 'key', 'title',
            'asset_type', 'strategy', 'priority', 'background_mode',
            'style_family', 'subject_text',
            'width', 'height', 'viewbox',
            'quality_score', 'is_reusable',
            'tags',
            'download_url',
            'updated_at',
        )
        read_only_fields = fields

    def get_download_url(self, obj: GeneratedAsset) -> str:
        return f'/board-generated-assets/{obj.id}.svg'


class AssetGenerationJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetGenerationJob
        fields = (
            'id', 'asset_key', 'status', 'selected_strategy',
            'errors', 'warnings', 'attempts',
            'started_at', 'completed_at',
            'created_at', 'updated_at',
        )
        read_only_fields = fields


class AssetPackSerializer(serializers.ModelSerializer):
    assets = GeneratedAssetBriefSerializer(many=True, read_only=True)
    jobs = AssetGenerationJobSerializer(many=True, read_only=True)

    class Meta:
        model = AssetPack
        fields = (
            'id', 'board', 'name', 'description',
            'subject', 'grade', 'topic',
            'style_family', 'style_dna', 'design_tokens', 'palette',
            'asset_plan', 'status', 'quality_score',
            'consistency_report', 'warnings',
            'assets', 'jobs',
            'created_at', 'updated_at',
        )
        read_only_fields = fields


class AssetPackBriefSerializer(serializers.ModelSerializer):
    asset_count = serializers.SerializerMethodField()

    class Meta:
        model = AssetPack
        fields = (
            'id', 'board', 'name', 'style_family',
            'status', 'quality_score', 'asset_count', 'updated_at',
        )
        read_only_fields = fields

    def get_asset_count(self, obj: AssetPack) -> int:
        return obj.assets.count()
