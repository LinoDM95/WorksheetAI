from django.contrib import admin
from .models import Worksheet
@admin.register(Worksheet)
class WorksheetAdmin(admin.ModelAdmin):
    list_display=('title','owner','subject','grade','pattern','created_at')
