import uuid
from django.db import models
from django.contrib.auth.models import User
from apps.patterns.models import WorksheetPattern

class Worksheet(models.Model):
    id=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner=models.ForeignKey(User, on_delete=models.CASCADE, related_name='worksheets')
    pattern=models.ForeignKey(WorksheetPattern, null=True, blank=True, on_delete=models.SET_NULL)
    title=models.CharField(max_length=255)
    subject=models.CharField(max_length=120, blank=True)
    grade=models.PositiveSmallIntegerField(null=True, blank=True)
    topic=models.CharField(max_length=255, blank=True)
    page_setup=models.JSONField(default=dict)
    content=models.JSONField(default=dict)
    render_model=models.JSONField(default=dict)
    status=models.CharField(max_length=20, default='draft')
    created_at=models.DateTimeField(auto_now_add=True)
    updated_at=models.DateTimeField(auto_now=True)
    def __str__(self): return self.title
