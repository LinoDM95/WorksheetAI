"""Datenmodell der Asset-Engine.

Modelle:
- ``AssetPack``: Sammlung visuell konsistenter Assets für ein Board.
- ``GeneratedAsset``: einzelnes erzeugtes oder wiederverwendetes Asset.
- ``AssetGenerationJob``: Job-Eintrag pro geplantem Asset eines Packs.
- ``AssetLibraryItem``: optionale kuratierte Bibliothek (vorbereitet, MVP-inaktiv).
"""

from __future__ import annotations

import uuid

from django.contrib.auth.models import User
from django.db import models


ASSET_PACK_STATUS_CHOICES = (
    ('planned', 'Geplant'),
    ('generating', 'In Erzeugung'),
    ('ready', 'Bereit'),
    ('partially_failed', 'Teilweise fehlgeschlagen'),
    ('failed', 'Fehlgeschlagen'),
    ('archived', 'Archiviert'),
)


ASSET_TYPE_CHOICES = (
    ('mascot', 'Mascot'),
    ('character', 'Charakter'),
    ('animal', 'Tier'),
    ('icon', 'Icon'),
    ('scene_object', 'Szenenobjekt'),
    ('background_layer', 'Hintergrund'),
    ('decorative', 'Dekoration'),
    ('frame', 'Rahmen'),
    ('badge', 'Badge'),
    ('sticker', 'Sticker'),
    ('marker', 'Marker'),
    ('arrow', 'Pfeil'),
    ('diagram_symbol', 'Diagramm-Symbol'),
    ('pattern', 'Muster'),
    ('overlay', 'Overlay'),
    ('card_skin', 'Kartenstil'),
    ('other', 'Sonstiges'),
)


ASSET_STRATEGY_CHOICES = (
    ('compiler', 'Compiler (Mascot/Shape Kit)'),
    ('procedural', 'Prozedural'),
    ('template_remix', 'Template-Remix'),
    ('svg_free_draw', 'SVG Free Draw'),
    ('asset_library', 'Asset-Bibliothek'),
    ('fallback_simple', 'Fallback (einfach)'),
)


ASSET_PRIORITY_CHOICES = (
    ('low', 'Niedrig'),
    ('medium', 'Mittel'),
    ('high', 'Hoch'),
    ('hero', 'Hero'),
)


ASSET_BACKGROUND_MODE_CHOICES = (
    ('transparent_cutout', 'Freigestellt (transparent)'),
    ('framed_scene', 'Eingerahmte Szene'),
    ('full_background', 'Voller Hintergrund'),
    ('overlay_frame', 'Overlay-Rahmen'),
    ('partial_overlay', 'Teil-Overlay'),
)


ASSET_JOB_STATUS_CHOICES = (
    ('pending', 'Wartend'),
    ('running', 'Läuft'),
    ('completed', 'Abgeschlossen'),
    ('failed', 'Fehlgeschlagen'),
    ('repaired', 'Repariert'),
    ('skipped', 'Übersprungen'),
)


class AssetPack(models.Model):
    """Pack mit zusammenhängenden Assets eines Boards."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='asset_packs',
    )
    board = models.ForeignKey(
        'boards.Board',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='asset_packs',
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    subject = models.CharField(max_length=120, blank=True)
    grade = models.CharField(max_length=60, blank=True)
    topic = models.CharField(max_length=220, blank=True)

    style_family = models.CharField(max_length=120, blank=True)
    style_dna = models.JSONField(default=dict, blank=True)
    design_tokens = models.JSONField(default=dict, blank=True)
    palette = models.JSONField(default=dict, blank=True)
    asset_plan = models.JSONField(default=dict, blank=True)

    status = models.CharField(
        max_length=30,
        choices=ASSET_PACK_STATUS_CHOICES,
        default='planned',
    )
    quality_score = models.FloatField(null=True, blank=True)
    consistency_report = models.JSONField(default=dict, blank=True)
    warnings = models.JSONField(default=list, blank=True)

    created_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_asset_packs',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.name or f'AssetPack {self.pk}'


class GeneratedAsset(models.Model):
    """Ein einzelnes erzeugtes oder wiederverwendetes Asset."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_pack = models.ForeignKey(
        AssetPack,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='assets',
    )
    owner = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='generated_assets',
    )
    board = models.ForeignKey(
        'boards.Board',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='generated_assets',
    )

    key = models.SlugField(max_length=80)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    asset_type = models.CharField(
        max_length=40,
        choices=ASSET_TYPE_CHOICES,
        default='other',
    )
    subject_text = models.CharField(max_length=255, blank=True)
    style_family = models.CharField(max_length=120, blank=True)

    strategy = models.CharField(
        max_length=40,
        choices=ASSET_STRATEGY_CHOICES,
        default='svg_free_draw',
    )
    priority = models.CharField(
        max_length=20,
        choices=ASSET_PRIORITY_CHOICES,
        default='medium',
    )
    background_mode = models.CharField(
        max_length=30,
        choices=ASSET_BACKGROUND_MODE_CHOICES,
        default='transparent_cutout',
    )

    asset_spec = models.JSONField(default=dict, blank=True)
    svg = models.TextField(blank=True)
    normalized_svg = models.TextField(blank=True)
    file = models.FileField(upload_to='generated_assets/', null=True, blank=True)
    preview_png = models.FileField(upload_to='generated_assets/previews/', null=True, blank=True)

    width = models.PositiveIntegerField(default=512)
    height = models.PositiveIntegerField(default=512)
    viewbox = models.CharField(max_length=120, blank=True)

    generation_prompt = models.TextField(blank=True)
    ai_raw_output = models.JSONField(default=dict, blank=True)
    validation_errors = models.JSONField(default=list, blank=True)
    validation_warnings = models.JSONField(default=list, blank=True)
    quality_report = models.JSONField(default=dict, blank=True)
    quality_score = models.FloatField(null=True, blank=True)
    repair_history = models.JSONField(default=list, blank=True)

    tags = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    is_reusable = models.BooleanField(default=False)
    is_quality_example = models.BooleanField(default=False)
    usage_count = models.PositiveIntegerField(default=0)

    created_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_generated_assets',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=('asset_pack', 'key'),
                name='generated_asset_pack_key_uniq',
                condition=models.Q(asset_pack__isnull=False),
            ),
        ]

    def __str__(self) -> str:
        return self.title or self.key or f'Asset {self.pk}'


class AssetGenerationJob(models.Model):
    """Job-Eintrag pro geplantem Asset im AssetPack."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_pack = models.ForeignKey(
        AssetPack,
        on_delete=models.CASCADE,
        related_name='jobs',
    )
    asset_key = models.SlugField(max_length=80)
    status = models.CharField(
        max_length=30,
        choices=ASSET_JOB_STATUS_CHOICES,
        default='pending',
    )
    request = models.JSONField(default=dict, blank=True)
    selected_strategy = models.CharField(max_length=40, blank=True)
    result_asset = models.ForeignKey(
        GeneratedAsset,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='jobs',
    )
    errors = models.JSONField(default=list, blank=True)
    warnings = models.JSONField(default=list, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.asset_key} ({self.status})'


class AssetLibraryItem(models.Model):
    """Kuratierte wiederverwendbare Assets — MVP-vorbereitet, optional aktiv."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    asset_type = models.CharField(
        max_length=40,
        choices=ASSET_TYPE_CHOICES,
        default='other',
    )
    style_family = models.CharField(max_length=120, blank=True)
    tags = models.JSONField(default=list, blank=True)
    svg = models.TextField(blank=True)
    file = models.FileField(upload_to='asset_library/', null=True, blank=True)
    license = models.CharField(max_length=120, blank=True)
    source = models.CharField(max_length=255, blank=True)
    quality_score = models.FloatField(null=True, blank=True)
    active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title']

    def __str__(self) -> str:
        return self.title
