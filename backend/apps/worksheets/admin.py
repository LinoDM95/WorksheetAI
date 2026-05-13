from django.contrib import admin
from .models import Worksheet, WorksheetRating, WorksheetLibraryComment
@admin.register(Worksheet)
class WorksheetAdmin(admin.ModelAdmin):
    list_display=('title','owner','subject','grade','pattern','created_at')


@admin.register(WorksheetRating)
class WorksheetRatingAdmin(admin.ModelAdmin):
    list_display = ('worksheet_id', 'user', 'stars', 'updated_at')
    ordering = ('-updated_at',)


@admin.register(WorksheetLibraryComment)
class WorksheetLibraryCommentAdmin(admin.ModelAdmin):
    list_display = ('worksheet_id', 'user_id', 'created_at')
    ordering = ('-created_at',)
