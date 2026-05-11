from __future__ import annotations

import uuid

from django.contrib.auth.models import User
from django.db import models


BOARD_TYPE_CHOICES = (
    ('interactive_board', 'Interaktives Board'),
    ('lesson_intro', 'Stundeneinstieg'),
    ('practice_board', 'Übungstafel'),
    ('explanation_board', 'Erklärtafel'),
    ('quiz_board', 'Quiz-Tafel'),
    ('map_board', 'Karten-Tafel'),
    ('simulation_board', 'Simulation'),
)

BOARD_STATUS_CHOICES = (
    ('draft', 'Entwurf'),
    ('generated', 'Erzeugt'),
    ('archived', 'Archiviert'),
)


def default_free_html_payload():
    """Legacy default — wird nur von Migration 0002 referenziert (vor Flat-Migration)."""
    return {}


def default_sandbox_options():
    """Legacy default — wird nur von Migration 0002 referenziert (vor Flat-Migration)."""
    return {}


class BoardFolder(models.Model):
    """Eigene Galerie-Struktur (Fächer, Klassenstufen, Themen) — hierarchische Ordner pro Lehrkraft."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='board_folders',
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='children',
    )
    name = models.CharField(max_length=120)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'name']
        constraints = (
            models.UniqueConstraint(
                fields=('owner', 'parent', 'name'),
                name='board_folder_owner_parent_name_uniq',
            ),
        )

    def path_label(self) -> str:
        parts: list[str] = []
        node: BoardFolder | None = self
        while node is not None:
            parts.append(node.name)
            node = node.parent
        return ' / '.join(reversed(parts))

    def __str__(self) -> str:
        return self.path_label()


class Board(models.Model):
    """Free HTML5 Board — KI erzeugt vollständigen sandboxed HTML/CSS/JS-Code."""

    class LibraryListingCategory(models.TextChoices):
        """Öffentliche Bibliothek: didaktische Großeinteilung (vom Autor bei Veröffentlichung gewählt)."""

        TASKS = 'tasks', 'Aufgaben'
        GAMES = 'games', 'Spiele'
        PRESENTATIONS = 'presentations', 'Präsentation'

    class LibraryModerationStatus(models.TextChoices):
        NONE = 'none', 'Nicht eingereicht'
        PENDING = 'pending', 'Freigabe ausstehend'
        APPROVED = 'approved', 'Freigegeben'
        REJECTED = 'rejected', 'Abgelehnt'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='boards',
    )
    folder = models.ForeignKey(
        BoardFolder,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='boards',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    subject = models.CharField(max_length=120, blank=True)
    grade = models.CharField(max_length=60, blank=True)
    grade_from = models.PositiveSmallIntegerField(null=True, blank=True)
    grade_to = models.PositiveSmallIntegerField(null=True, blank=True)
    topic = models.CharField(max_length=220, blank=True)
    board_type = models.CharField(
        max_length=40,
        choices=BOARD_TYPE_CHOICES,
        default='interactive_board',
    )
    status = models.CharField(
        max_length=20,
        choices=BOARD_STATUS_CHOICES,
        default='draft',
    )

    # Free HTML5 Code — wird ausschließlich in iframe sandbox ausgeführt.
    html = models.TextField(blank=True)
    css = models.TextField(blank=True)
    javascript = models.TextField(blank=True)

    teacher_notes = models.TextField(blank=True)
    usage_instructions = models.JSONField(default=list)
    warnings = models.JSONField(default=list)

    used_libraries = models.JSONField(default=list)
    used_assets = models.JSONField(default=list)
    used_datasets = models.JSONField(default=list)

    generation_prompt = models.TextField(blank=True)
    generation_input = models.JSONField(default=dict)
    ai_raw_output = models.JSONField(default=dict)
    validation_errors = models.JSONField(default=list)
    validation_warnings = models.JSONField(default=list)

    # Smartboard Kreativmodus-Pipeline-Artefakte. Default-leer für abwärtskompatible Migration.
    creative_brief = models.JSONField(default=dict, blank=True)
    style_dna = models.JSONField(default=dict, blank=True)
    intent_analysis = models.JSONField(default=dict, blank=True)
    risk_analysis = models.JSONField(default=dict, blank=True)
    quality_report = models.JSONField(default=dict, blank=True)
    browser_test_result = models.JSONField(default=dict, blank=True)
    touch_audit_result = models.JSONField(default=dict, blank=True)
    screenshot_quality_result = models.JSONField(default=dict, blank=True)
    repair_history = models.JSONField(default=list, blank=True)
    used_model_config = models.JSONField(default=dict, blank=True)
    token_usage = models.JSONField(default=dict, blank=True)
    estimated_cost = models.JSONField(default=dict, blank=True)
    is_quality_example = models.BooleanField(default=False)
    quality_tags = models.JSONField(default=list, blank=True)
    reuse_pattern_summary = models.TextField(blank=True)

    # Asset-Engine: Composer-Output (assets[].url|inline_svg|role|size_hint, style_rules, usage_rules).
    # Wird vom Code-Prompt benutzt und im Frontend für den Asset-Tab angezeigt.
    assets_summary = models.JSONField(default=dict, blank=True)

    share_token = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True)
    student_link_enabled = models.BooleanField(default=False)
    student_link_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    library_public = models.BooleanField(default=False)
    library_published_at = models.DateTimeField(null=True, blank=True)
    library_moderation_status = models.CharField(
        max_length=20,
        choices=LibraryModerationStatus.choices,
        default=LibraryModerationStatus.NONE,
        db_index=True,
    )

    library_listing_title = models.CharField(max_length=255, blank=True)
    library_listing_topic = models.CharField(max_length=220, blank=True)
    library_listing_description = models.TextField(blank=True)
    library_listing_category = models.CharField(
        max_length=20,
        choices=LibraryListingCategory.choices,
        blank=True,
        default='',
    )
    library_snapshot_html = models.TextField(blank=True)
    library_snapshot_css = models.TextField(blank=True)
    library_snapshot_javascript = models.TextField(blank=True)
    library_snapshot_used_libraries = models.JSONField(default=list, blank=True)
    library_snapshot_used_datasets = models.JSONField(default=list, blank=True)
    library_snapshot_at = models.DateTimeField(null=True, blank=True)
    library_snapshot_subject = models.CharField(max_length=120, blank=True, default='')
    library_snapshot_grade = models.CharField(max_length=60, blank=True, default='')
    library_snapshot_grade_from = models.PositiveSmallIntegerField(null=True, blank=True)
    library_snapshot_grade_to = models.PositiveSmallIntegerField(null=True, blank=True)
    library_snapshot_duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    source_board = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='derived_boards',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.title or f'Board {self.pk}'

    def is_catalog_listed(self) -> bool:
        """Sichtbar in der öffentlichen Bibliothek (nach Admin-Freigabe)."""
        return self.library_public and self.library_moderation_status == self.LibraryModerationStatus.APPROVED


class BoardRating(models.Model):
    """Sterne-Bewertung (1–5) eines öffentlich bibliotheks-gelisteten Boards pro Nutzer."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='ratings')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='board_ratings')
    stars = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = (
            models.UniqueConstraint(fields=('board', 'user'), name='board_rating_board_user_uniq'),
        )

    def __str__(self) -> str:
        return f'{self.stars}★ für {self.board_id}'


class BoardLibraryComment(models.Model):
    """Anonymer Community-Kommentar zu einem öffentlich gelisteten Board."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='library_comments')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='board_library_comments')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['board', '-created_at']),
        ]

    def __str__(self) -> str:
        return f'Kommentar {self.pk} zu {self.board_id}'


REVISION_MODE_CHOICES = (
    ('general', 'Allgemein'),
    ('bug_fix', 'Fehler beheben'),
    ('design_improve', 'Design verbessern'),
    ('touch_optimize', 'Touch optimieren'),
    ('content_change', 'Inhalt ändern'),
    ('simplify', 'Vereinfachen'),
    ('make_more_creative', 'Kreativer machen'),
    ('performance_improve', 'Performance verbessern'),
)


class BoardRevision(models.Model):
    """Eine Nachprompt-/Code-Änderung; speichert vorher/nachher als flachen Code."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey(
        Board,
        on_delete=models.CASCADE,
        related_name='revisions',
    )
    prompt = models.TextField(blank=True)
    revision_mode = models.CharField(
        max_length=30,
        choices=REVISION_MODE_CHOICES,
        default='general',
    )

    previous_html = models.TextField(blank=True)
    previous_css = models.TextField(blank=True)
    previous_javascript = models.TextField(blank=True)
    new_html = models.TextField(blank=True)
    new_css = models.TextField(blank=True)
    new_javascript = models.TextField(blank=True)

    previous_metadata = models.JSONField(default=dict)
    new_metadata = models.JSONField(default=dict)

    ai_raw_output = models.JSONField(default=dict)
    validation_errors = models.JSONField(default=list)
    validation_warnings = models.JSONField(default=list)

    quality_report_before = models.JSONField(default=dict, blank=True)
    quality_report_after = models.JSONField(default=dict, blank=True)
    repair_notes = models.JSONField(default=list, blank=True)
    used_model_config = models.JSONField(default=dict, blank=True)
    token_usage = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='board_revisions',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'Revision {self.pk} für {self.board_id}'


class AIUsageLog(models.Model):
    """Token-/Kostenlogging pro Pipeline-Step (Smartboard Kreativmodus).

    Eine Zeile pro KI-Aufruf — sowohl kleines als auch großes Modell. Pflicht für
    Quality-Mode-Vergleiche und Cost-Reporting.
    """

    STEP_TYPE_CHOICES = (
        ('intent', 'Intent'),
        ('risk', 'Risk'),
        ('creative_brief', 'Creative Brief'),
        ('style_dna', 'Style DNA'),
        ('code_generation', 'Code-Generierung'),
        ('repair', 'Reparatur'),
        ('screenshot_judge', 'Screenshot-Judge'),
        ('revision', 'Revision'),
        # Asset-Engine
        ('asset_intent', 'Asset Intent'),
        ('asset_plan', 'Asset Plan'),
        ('asset_strategy', 'Asset Strategy'),
        ('asset_svg_generation', 'Asset SVG Generation'),
        ('asset_repair', 'Asset Repair'),
        ('asset_quality_judge', 'Asset Quality Judge'),
        ('asset_pack_consistency', 'Asset Pack Consistency'),
        ('asset_pack_generation', 'Asset Pack Generation'),
        ('worksheet_generation', 'Arbeitsblatt Generierung'),
        ('worksheet_review', 'Arbeitsblatt Review'),
        ('worksheet_page_regenerate', 'Arbeitsblatt Seite regenerieren'),
        ('blocks_slot_fill', 'Bausteine Slot-Filling'),
        ('curriculum_extraction', 'Lehrplan-KI-Extraktion'),
        ('curriculum_auto_discovery', 'Lehrplan Auto-Discovery'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='ai_usage_logs',
    )
    board = models.ForeignKey(
        Board,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='ai_usage',
    )
    step_type = models.CharField(max_length=40, choices=STEP_TYPE_CHOICES)
    model_name = models.CharField(max_length=100)
    input_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    estimated_cost_cents = models.IntegerField(default=0)
    success = models.BooleanField(default=True)
    error_message = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['step_type', 'created_at']),
            models.Index(fields=['board', 'step_type']),
        ]

    def __str__(self) -> str:
        return f'{self.step_type}/{self.model_name} ({self.input_tokens}+{self.output_tokens})'
