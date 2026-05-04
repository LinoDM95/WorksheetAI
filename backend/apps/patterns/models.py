import uuid
from django.db import models
from django.contrib.auth.models import User

class WorksheetPattern(models.Model):
    STATUS=[('draft','Draft'),('validated','Validated'),('active','Active'),('archived','Archived')]
    id=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key=models.SlugField(unique=True)
    name=models.CharField(max_length=180)
    description=models.TextField(blank=True)
    status=models.CharField(max_length=20, choices=STATUS, default='draft')
    source_format=models.CharField(max_length=10, choices=[('yaml','YAML'),('json','JSON')], default='yaml')
    blueprint=models.JSONField(default=dict)
    preview_svg=models.TextField(blank=True)
    version=models.CharField(max_length=40, default='1.0.0')
    created_by=models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    is_system=models.BooleanField(default=False)
    quality_score=models.FloatField(default=0)
    last_validation_errors=models.JSONField(default=list)
    created_at=models.DateTimeField(auto_now_add=True)
    updated_at=models.DateTimeField(auto_now=True)
    def __str__(self): return self.name
