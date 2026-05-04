from django.contrib import admin
from .models import WorksheetPattern
@admin.register(WorksheetPattern)
class WorksheetPatternAdmin(admin.ModelAdmin):
    list_display=('key','name','status','is_system','quality_score','updated_at')
    search_fields=('key','name')
