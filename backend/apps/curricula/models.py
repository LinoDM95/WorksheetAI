import uuid

from django.conf import settings
from django.db import models


class CurriculumSource(models.Model):
    DOCUMENT_TEIL_A = 'teil_a'
    DOCUMENT_TEIL_B = 'teil_b'
    DOCUMENT_TEIL_C = 'teil_c_subject'
    DOCUMENT_RLP_KOMPAKT = 'rlp_kompakt'
    DOCUMENT_OTHER = 'other'
    DOCUMENT_TYPE_CHOICES = [
        (DOCUMENT_TEIL_A, 'Teil A'),
        (DOCUMENT_TEIL_B, 'Teil B'),
        (DOCUMENT_TEIL_C, 'Teil C / Fach'),
        (DOCUMENT_RLP_KOMPAKT, 'RLP kompakt'),
        (DOCUMENT_OTHER, 'Sonstiges'),
    ]

    EXTRACTION_NOT = 'not_extracted'
    EXTRACTION_WORKING = 'extracting'
    EXTRACTION_DONE = 'extracted'
    EXTRACTION_FAILED = 'failed'
    EXTRACTION_STATUS_CHOICES = [
        (EXTRACTION_NOT, 'Nicht extrahiert'),
        (EXTRACTION_WORKING, 'Extrahiert …'),
        (EXTRACTION_DONE, 'Extrahiert'),
        (EXTRACTION_FAILED, 'Fehlgeschlagen'),
    ]

    DISCOVERY_NOT = 'not_run'
    DISCOVERY_RUNNING = 'running'
    DISCOVERY_DONE = 'done'
    DISCOVERY_FAILED = 'failed'
    DISCOVERY_STATUS_CHOICES = [
        (DISCOVERY_NOT, 'Nicht gelaufen'),
        (DISCOVERY_RUNNING, 'Auto-Discovery läuft …'),
        (DISCOVERY_DONE, 'Plan erstellt'),
        (DISCOVERY_FAILED, 'Discovery fehlgeschlagen'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, blank=True)
    state = models.CharField(max_length=120)
    country = models.CharField(max_length=80, default='DE')
    document_type = models.CharField(max_length=32, choices=DOCUMENT_TYPE_CHOICES, default=DOCUMENT_OTHER)
    subject = models.CharField(max_length=120, blank=True)
    version = models.CharField(max_length=80, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)
    file = models.FileField(upload_to='curriculum_sources/')
    page_count = models.PositiveIntegerField(default=0)
    extracted_pages = models.JSONField(default=list)
    extraction_status = models.CharField(
        max_length=20,
        choices=EXTRACTION_STATUS_CHOICES,
        default=EXTRACTION_NOT,
    )
    extraction_error = models.TextField(blank=True)
    discovery_status = models.CharField(
        max_length=20,
        choices=DISCOVERY_STATUS_CHOICES,
        default=DISCOVERY_NOT,
    )
    discovery_plan = models.JSONField(default=list)
    discovery_error = models.TextField(blank=True)
    replicate_states = models.JSONField(default=list)
    auto_run_id = models.UUIDField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='curriculum_sources_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    page_images_generated = models.BooleanField(default=False)
    page_preview_paths = models.JSONField(default=list)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title or f'{self.state} · {self.get_document_type_display()}'


class CurriculumExtractionJob(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_PENDING = 'pending'
    STATUS_RUNNING = 'running'
    STATUS_COMPLETED = 'completed'
    STATUS_FAILED = 'failed'
    STATUS_APPROVED = 'approved'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Entwurf'),
        (STATUS_PENDING, 'Ausstehend'),
        (STATUS_RUNNING, 'Läuft'),
        (STATUS_COMPLETED, 'Abgeschlossen'),
        (STATUS_FAILED, 'Fehlgeschlagen'),
        (STATUS_APPROVED, 'Genehmigt'),
    ]

    REVIEW_NONE = 'not_reviewed'
    REVIEW_NEEDS = 'needs_review'
    REVIEW_DONE = 'reviewed'
    REVIEW_REJECTED = 'rejected'
    REVIEW_STATUS_CHOICES = [
        (REVIEW_NONE, 'Nicht geprüft'),
        (REVIEW_NEEDS, 'Prüfung nötig'),
        (REVIEW_DONE, 'Geprüft'),
        (REVIEW_REJECTED, 'Abgelehnt'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.ForeignKey(
        CurriculumSource,
        on_delete=models.CASCADE,
        related_name='jobs',
    )
    state = models.CharField(max_length=120)
    subject = models.CharField(max_length=120)
    grade_band = models.CharField(max_length=60)
    level_band = models.JSONField(default=list)
    topic_hint = models.CharField(max_length=220, blank=True)
    page_start = models.PositiveIntegerField(null=True, blank=True)
    page_end = models.PositiveIntegerField(null=True, blank=True)
    selected_pages = models.JSONField(default=list)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    prompt_text = models.TextField(blank=True)
    ai_raw_output = models.JSONField(default=dict)
    extracted_context = models.JSONField(default=dict)
    validation_errors = models.JSONField(default=list)
    review_status = models.CharField(
        max_length=20,
        choices=REVIEW_STATUS_CHOICES,
        default=REVIEW_NONE,
    )
    review_notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_curriculum_jobs',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    source_excerpt = models.JSONField(default=dict)
    extraction_summary = models.TextField(blank=True)
    auto_run_id = models.UUIDField(null=True, blank=True)
    plan_index = models.PositiveIntegerField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='curriculum_extraction_jobs_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['source', 'auto_run_id']),
            models.Index(fields=['auto_run_id']),
        ]

    def __str__(self):
        return f'{self.subject} {self.grade_band} ({self.get_status_display()})'


class CurriculumContext(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_ACTIVE = 'active'
    STATUS_ARCHIVED = 'archived'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Entwurf'),
        (STATUS_ACTIVE, 'Aktiv'),
        (STATUS_ARCHIVED, 'Archiviert'),
    ]

    QUALITY_UNCHECKED = 'unchecked'
    QUALITY_AI = 'ai_extracted'
    QUALITY_HUMAN = 'human_reviewed'
    QUALITY_CHOICES = [
        (QUALITY_UNCHECKED, 'Ungeprüft'),
        (QUALITY_AI, 'KI-extrahiert'),
        (QUALITY_HUMAN, 'Manuell geprüft'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    state = models.CharField(max_length=120)
    country = models.CharField(max_length=80, default='DE')
    curriculum_version = models.CharField(max_length=120, blank=True)
    source = models.ForeignKey(
        CurriculumSource,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='contexts',
    )
    extraction_job = models.ForeignKey(
        CurriculumExtractionJob,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='contexts_created',
    )
    subject = models.CharField(max_length=120)
    grade_band = models.CharField(max_length=60)
    level_band = models.JSONField(default=list)
    topic_area = models.CharField(max_length=220)
    subtopics = models.JSONField(default=list)
    competency_goals = models.JSONField(default=list)
    knowledge_goals = models.JSONField(default=list)
    skills = models.JSONField(default=list)
    allowed_task_types = models.JSONField(default=list)
    recommended_worksheet_formats = models.JSONField(default=list)
    language_guidance = models.JSONField(default=dict)
    media_guidance = models.JSONField(default=list)
    cross_curricular_links = models.JSONField(default=list)
    validation_rules = models.JSONField(default=list)
    difficulty_notes = models.JSONField(default=list)
    source_refs = models.JSONField(default=list)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    quality_status = models.CharField(max_length=20, choices=QUALITY_CHOICES, default=QUALITY_UNCHECKED)
    public_summary = models.TextField(blank=True)
    teacher_facing_summary = models.JSONField(default=dict)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='curriculum_contexts_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['state', 'subject', 'grade_band', 'topic_area']

    def __str__(self):
        return f'{self.subject} · {self.grade_band} · {self.topic_area}'


class CurriculumRule(models.Model):
    RULE_ARITHMETIC = 'arithmetic_range'
    RULE_OPERATION = 'operation_type'
    RULE_TASK_COUNT = 'task_count'
    RULE_SOLUTION = 'solution_check'
    RULE_TEXT_LEN = 'text_length'
    RULE_OPERATORS = 'allowed_operators'
    RULE_CUSTOM = 'custom'
    RULE_TYPE_CHOICES = [
        (RULE_ARITHMETIC, 'Zahlenraum'),
        (RULE_OPERATION, 'Operationstyp'),
        (RULE_TASK_COUNT, 'Aufgabenanzahl'),
        (RULE_SOLUTION, 'Lösungsprüfung'),
        (RULE_TEXT_LEN, 'Textlänge'),
        (RULE_OPERATORS, 'Operatoren'),
        (RULE_CUSTOM, 'Benutzerdefiniert'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.SlugField(unique=True)
    name = models.CharField(max_length=180)
    subject = models.CharField(max_length=120)
    grade_band = models.CharField(max_length=60, blank=True)
    topic_area = models.CharField(max_length=220, blank=True)
    rule_type = models.CharField(max_length=40, choices=RULE_TYPE_CHOICES, default=RULE_CUSTOM)
    config = models.JSONField(default=dict)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['subject', 'key']

    def __str__(self):
        return self.name


class WorksheetCurriculumUsage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    worksheet = models.ForeignKey(
        'worksheets.Worksheet',
        on_delete=models.CASCADE,
        related_name='curriculum_usages',
    )
    context = models.ForeignKey(
        CurriculumContext,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='worksheet_usages',
    )
    match_score = models.FloatField(default=0.0)
    match_reasons = models.JSONField(default=list)
    used_context_snapshot = models.JSONField(default=dict)
    teacher_visible_summary = models.JSONField(default=dict)
    ai_usage_note = models.TextField(blank=True)
    curriculum_alignment = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Usage {self.worksheet_id}'
