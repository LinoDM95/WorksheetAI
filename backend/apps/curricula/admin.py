from django.contrib import admin

from .models import (
    CurriculumContext,
    CurriculumExtractionJob,
    CurriculumRule,
    CurriculumSource,
    WorksheetCurriculumUsage,
)


@admin.register(CurriculumSource)
class CurriculumSourceAdmin(admin.ModelAdmin):
    list_display = (
        'title',
        'state',
        'document_type',
        'page_count',
        'extraction_status',
        'discovery_status',
        'created_at',
    )
    list_filter = ('extraction_status', 'discovery_status', 'document_type', 'country')
    search_fields = ('title', 'state', 'subject')


@admin.register(CurriculumExtractionJob)
class CurriculumExtractionJobAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'source',
        'subject',
        'grade_band',
        'status',
        'review_status',
        'auto_run_id',
        'plan_index',
        'created_at',
    )
    list_filter = ('status', 'review_status')
    raw_id_fields = ('source', 'reviewed_by', 'created_by')


@admin.register(CurriculumContext)
class CurriculumContextAdmin(admin.ModelAdmin):
    list_display = ('subject', 'grade_band', 'topic_area', 'state', 'status', 'quality_status', 'created_at')
    list_filter = ('status', 'quality_status', 'country')
    search_fields = ('topic_area', 'subject', 'state')


@admin.register(CurriculumRule)
class CurriculumRuleAdmin(admin.ModelAdmin):
    list_display = ('key', 'name', 'subject', 'rule_type', 'active')
    list_filter = ('rule_type', 'active')


@admin.register(WorksheetCurriculumUsage)
class WorksheetCurriculumUsageAdmin(admin.ModelAdmin):
    list_display = ('worksheet', 'context', 'match_score', 'created_at')
    raw_id_fields = ('worksheet', 'context')
