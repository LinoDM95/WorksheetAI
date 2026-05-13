import uuid
from django.db import models
from django.contrib.auth.models import User
from apps.boards.models import REVISION_MODE_CHOICES

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
    source_worksheet = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='derived_worksheets',
    )
    created_at=models.DateTimeField(auto_now_add=True)
    updated_at=models.DateTimeField(auto_now=True)
    def __str__(self): return self.title

    def is_catalog_listed(self) -> bool:
        return self.library_public and self.library_moderation_status == self.LibraryModerationStatus.APPROVED


class WorksheetRating(models.Model):
    """Sterne-Bewertung (1–5) eines öffentlich bibliotheks-gelisteten Arbeitsblatts pro Nutzer."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    worksheet = models.ForeignKey(
        Worksheet,
        on_delete=models.CASCADE,
        related_name='ratings',
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='worksheet_ratings',
    )
    stars = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = (
            models.UniqueConstraint(
                fields=('worksheet', 'user'),
                name='worksheet_rating_worksheet_user_uniq',
            ),
        )

    def __str__(self) -> str:
        return f'{self.stars}★ für {self.worksheet_id}'


class WorksheetLibraryComment(models.Model):
    """Community-Kommentar zu einem öffentlich gelisteten Arbeitsblatt."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    worksheet = models.ForeignKey(
        Worksheet,
        on_delete=models.CASCADE,
        related_name='library_comments',
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='worksheet_library_comments',
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['worksheet', '-created_at']),
        ]

    def __str__(self) -> str:
        return f'Kommentar {self.pk} zu {self.worksheet_id}'

class WorksheetRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    worksheet = models.ForeignKey(
        Worksheet,
        on_delete=models.CASCADE,
        related_name='revisions',
    )
    prompt = models.TextField(blank=True)
    revision_mode = models.CharField(
        max_length=30,
        choices=REVISION_MODE_CHOICES,
        default='general',
    )
    previous_content = models.JSONField(default=dict)
    new_content = models.JSONField(default=dict)
    previous_render_model = models.JSONField(default=dict)
    new_render_model = models.JSONField(default=dict)
    previous_metadata = models.JSONField(default=dict)
    new_metadata = models.JSONField(default=dict)
    ai_raw_output = models.JSONField(default=dict)
    validation_errors = models.JSONField(default=list)
    validation_warnings = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='worksheet_revisions',
    )

    class Meta:
        ordering = ['-created_at']
