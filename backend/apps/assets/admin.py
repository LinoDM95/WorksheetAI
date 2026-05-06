from django.contrib import admin

from .models import AssetGenerationJob, AssetLibraryItem, AssetPack, GeneratedAsset


@admin.register(AssetPack)
class AssetPackAdmin(admin.ModelAdmin):
    list_display = ('name', 'board', 'style_family', 'status', 'quality_score', 'created_at')
    search_fields = ('name', 'subject', 'topic', 'board__title')
    list_filter = ('status', 'style_family')
    raw_id_fields = ('board', 'owner', 'created_by')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(GeneratedAsset)
class GeneratedAssetAdmin(admin.ModelAdmin):
    list_display = (
        'key', 'asset_type', 'strategy', 'style_family',
        'quality_score', 'is_reusable', 'usage_count', 'created_at',
    )
    search_fields = ('key', 'title', 'subject_text', 'tags')
    list_filter = ('asset_type', 'strategy', 'priority', 'background_mode', 'is_reusable', 'is_quality_example')
    raw_id_fields = ('asset_pack', 'board', 'owner', 'created_by')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(AssetGenerationJob)
class AssetGenerationJobAdmin(admin.ModelAdmin):
    list_display = ('asset_key', 'asset_pack', 'status', 'selected_strategy', 'attempts', 'updated_at')
    search_fields = ('asset_key', 'asset_pack__name')
    list_filter = ('status', 'selected_strategy')
    raw_id_fields = ('asset_pack', 'result_asset')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(AssetLibraryItem)
class AssetLibraryItemAdmin(admin.ModelAdmin):
    list_display = ('title', 'asset_type', 'style_family', 'quality_score', 'active', 'updated_at')
    search_fields = ('title', 'tags')
    list_filter = ('asset_type', 'style_family', 'active')
    readonly_fields = ('id', 'created_at', 'updated_at')
