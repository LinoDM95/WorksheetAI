from __future__ import annotations

import uuid

from django.contrib.auth.models import User
from django.db import models


BOARD_TYPE_CHOICES = (
    ('interactive_board', 'Interaktives Tafelbild'),
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
    """Free HTML5 Tafelbild — KI erzeugt vollständigen sandboxed HTML/CSS/JS-Code."""

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

    share_token = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True)
    student_link_enabled = models.BooleanField(default=False)
    library_public = models.BooleanField(default=False)
    library_published_at = models.DateTimeField(null=True, blank=True)
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


class BoardRating(models.Model):
    """Sterne-Bewertung (1–5) eines öffentlich bibliotheks-gelisteten Tafelbilds pro Nutzer."""

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


class BoardRevision(models.Model):
    """Eine Nachprompt-/Code-Änderung; speichert vorher/nachher als flachen Code."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey(
        Board,
        on_delete=models.CASCADE,
        related_name='revisions',
    )
    prompt = models.TextField(blank=True)

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
