import uuid
from django.db import models

class FederalState(models.Model):
    id=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name=models.CharField(max_length=120)
    slug=models.SlugField(unique=True)
    def __str__(self): return self.name

class SchoolType(models.Model):
    id=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name=models.CharField(max_length=120)
    slug=models.SlugField(unique=True)
    def __str__(self): return self.name

class Subject(models.Model):
    id=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name=models.CharField(max_length=120)
    slug=models.SlugField(unique=True)
    def __str__(self): return self.name

class GradeLevel(models.Model):
    id=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    value=models.PositiveSmallIntegerField(unique=True)
    label=models.CharField(max_length=40)
    def __str__(self): return self.label

class CurriculumUnit(models.Model):
    id=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    federal_state=models.ForeignKey(FederalState, on_delete=models.CASCADE)
    school_type=models.ForeignKey(SchoolType, on_delete=models.SET_NULL, null=True, blank=True)
    subject=models.ForeignKey(Subject, on_delete=models.CASCADE)
    grade_level=models.ForeignKey(GradeLevel, on_delete=models.CASCADE)
    title=models.CharField(max_length=255)
    topic=models.CharField(max_length=255)
    competency_text=models.TextField()
    keywords=models.JSONField(default=list)
    is_demo_data=models.BooleanField(default=True)
    def __str__(self): return f'{self.subject} {self.grade_level}: {self.title}'
