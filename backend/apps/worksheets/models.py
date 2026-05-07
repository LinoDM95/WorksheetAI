import uuid
from django.db import models
from django.contrib.auth.models import User
from apps.patterns.models import WorksheetPattern

class Worksheet(models.Model):
    class LibraryModerationStatus(models.TextChoices):
        NONE = 'none', 'Nicht eingereicht'
        PENDING = 'pending', 'Freigabe ausstehend'
        APPROVED = 'approved', 'Freigegeben'
        REJECTED = 'rejected', 'Abgelehnt'

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
    generation_meta=models.JSONField(default=dict)
    library_public=models.BooleanField(default=False)
    library_listing_title = models.CharField(max_length=255, blank=True)
    library_listing_topic = models.CharField(max_length=220, blank=True)
    library_listing_description = models.TextField(blank=True)
    library_published_at=models.DateTimeField(null=True, blank=True)
    library_moderation_status=models.CharField(
        max_length=20,
        choices=LibraryModerationStatus.choices,
        default=LibraryModerationStatus.NONE,
        db_index=True,
    )
    created_at=models.DateTimeField(auto_now_add=True)
    updated_at=models.DateTimeField(auto_now=True)
    def __str__(self): return self.title

    def is_catalog_listed(self) -> bool:
        return self.library_public and self.library_moderation_status == self.LibraryModerationStatus.APPROVED
