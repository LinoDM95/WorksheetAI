from rest_framework import serializers
import copy
import json

from django.conf import settings
from django.utils import timezone

from .models import Worksheet, WorksheetLibraryComment, WorksheetRating, WorksheetRevision
from .services.render_model import build_render_model
from .services.content_blocks import apply_page_coalesce_to_content, apply_page_overflow_reflow
from .services.creative_html_pipeline import (
    build_creative_html_render_model,
    is_creative_html_content,
    repair_creative_html_worksheet,
    worksheet_pages_are_creative_html_shape,
)

import logging

from .owner import resolve_worksheet_owner
from .services.worksheet_revision_head import (
    append_manual_content_revision,
    latest_revision,
    worksheet_matches_revision_head,
    worksheet_metadata_snapshot,
)
from .services.worksheet_thumbnail_preview import first_page_render_model_for_thumbnail

logger = logging.getLogger(__name__)

_LISTING_CAP_TITLE = 255
_LISTING_CAP_TOPIC = 220
_LISTING_CAP_DESC = 8000


def _worksheet_content_is_creative_html(content: dict) -> bool:
    return is_creative_html_content(content) or worksheet_pages_are_creative_html_shape(content)


def _planned_duration_from_worksheet(obj: Worksheet) -> int | None:
    meta = obj.generation_meta if isinstance(obj.generation_meta, dict) else {}
    raw = meta.get('time_budget_minutes')
    if raw is not None:
        try:
            v = int(raw)
            if v > 0:
                return v
        except (TypeError, ValueError):
            pass
    return None


def build_curriculum_usage_payload(worksheet: Worksheet) -> dict:
    usage_qs = getattr(worksheet, 'curriculum_usages', None)
    latest = usage_qs.order_by('-created_at').first() if usage_qs is not None else None
    meta = worksheet.generation_meta if isinstance(worksheet.generation_meta, dict) else {}
    warning = meta.get('curriculum_warning')

    if latest:
        tv = latest.teacher_visible_summary if isinstance(latest.teacher_visible_summary, dict) else {}
        panel = {
            'state': tv.get('state'),
            'subject': tv.get('subject'),
            'grade_band': tv.get('grade_band'),
            'topic_area': tv.get('topic_area'),
            'subtopics': tv.get('subtopics') or [],
            'competency_goals': tv.get('competency_goals') or [],
            'allowed_task_types': tv.get('allowed_task_types') or [],
            'validation_rules': tv.get('validation_rules') or [],
            'sources': tv.get('sources') or [],
            'quality_status': tv.get('quality_status'),
            'match_reasons': tv.get('match_reasons') or latest.match_reasons or [],
            'match_score': tv.get('match_score', latest.match_score),
            'ai_usage_note': latest.ai_usage_note or '',
            'curriculum_alignment': latest.curriculum_alignment if isinstance(latest.curriculum_alignment, dict) else {},
            'title': tv.get('title'),
            'short_description': tv.get('short_description'),
            'source_label': tv.get('source_label'),
        }
        return {'has_curriculum_context': True, 'usage': panel}

    return {
        'has_curriculum_context': False,
        'usage': None,
        'warning': str(warning) if warning else (
            'Für dieses Arbeitsblatt wurde kein aktiver Lehrplan-Kontext gefunden oder genutzt.'
        ),
    }


def _resolve_worksheet_listing(instance: Worksheet, data: dict) -> tuple[str, str, str]:
    lt_raw = data['library_listing_title'] if 'library_listing_title' in data else instance.library_listing_title
    lk_raw = data['library_listing_topic'] if 'library_listing_topic' in data else instance.library_listing_topic
    ld_raw = data['library_listing_description'] if 'library_listing_description' in data else instance.library_listing_description
    return (
        str(lt_raw or '').strip(),
        str(lk_raw or '').strip(),
        str(ld_raw or '').strip(),
    )


class WorksheetSerializer(serializers.ModelSerializer):
    planned_duration_minutes = serializers.IntegerField(write_only=True, required=False, allow_null=True, min_value=5, max_value=90)
    pattern_name = serializers.CharField(source='pattern.name', read_only=True)
    curriculum_warning = serializers.SerializerMethodField()
    curriculum_show_usage = serializers.SerializerMethodField()
    curriculum_usage_panel = serializers.SerializerMethodField()
    viewer_is_owner = serializers.SerializerMethodField()
    revision_head_id = serializers.SerializerMethodField()
    can_revise_with_ai = serializers.SerializerMethodField()

    class Meta:
        model=Worksheet
        fields=['id','planned_duration_minutes','title','subject','grade','topic','page_setup','content','render_model','status',
                'generation_meta','pattern','pattern_name','created_at','updated_at',
                'curriculum_warning','curriculum_show_usage','curriculum_usage_panel',
                'library_public','library_listing_title','library_listing_topic','library_listing_description',
                'library_moderation_status','library_published_at','viewer_is_owner',
                'revision_head_id','can_revise_with_ai']
        read_only_fields=['owner','created_at','updated_at','generation_meta','library_published_at','viewer_is_owner','library_moderation_status',
                         'revision_head_id','can_revise_with_ai']

    def get_viewer_is_owner(self, obj: Worksheet) -> bool:
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return False
        return obj.owner_id == request.user.id

    @staticmethod
    def get_revision_head_id(obj: Worksheet) -> str | None:
        r = latest_revision(obj)
        return str(r.pk) if r else None

    @staticmethod
    def get_can_revise_with_ai(obj: Worksheet) -> bool:
        return worksheet_matches_revision_head(obj)

    @staticmethod
    def get_curriculum_warning(obj: Worksheet) -> str | None:
        meta = obj.generation_meta if isinstance(obj.generation_meta, dict) else {}
        w = meta.get('curriculum_warning')
        return str(w) if w else None

    @staticmethod
    def get_curriculum_show_usage(obj: Worksheet) -> bool:
        return bool(getattr(settings, 'CURRICULUM_SHOW_USAGE_TO_TEACHERS', True))

    @staticmethod
    def get_curriculum_usage_panel(obj: Worksheet) -> dict:
        return build_curriculum_usage_payload(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        req = {
            'theme': (instance.render_model or {}).get('theme', 'neutral'),
            'creativity': (instance.render_model or {}).get('creativity', 'balanced'),
            'show_sheet_header': (instance.render_model or {}).get('show_sheet_header', True),
        }
        content = instance.content if isinstance(instance.content, dict) else {}
        rm_existing = data.get('render_model')
        if not self._render_model_usable(rm_existing):
            try:
                if _worksheet_content_is_creative_html(content):
                    c2, _ = repair_creative_html_worksheet(copy.deepcopy(content), instance.page_setup)
                    data['render_model'] = build_creative_html_render_model(c2, instance.page_setup, req)
                else:
                    data['render_model'] = build_render_model(
                        content,
                        instance.page_setup,
                        instance.pattern,
                        req,
                    )
            except Exception as exc:
                logger.warning('render_model Neuaufbau fehlgeschlagen, nutze gespeichertes Modell: %s', exc)
                if isinstance(instance.render_model, dict) and instance.render_model:
                    data['render_model'] = instance.render_model
                else:
                    data['render_model'] = {'version': 'fallback', 'pages': [], 'solutions': []}
        if self.context.get('worksheet_list'):
            data['thumbnail_render_model'] = first_page_render_model_for_thumbnail(data.get('render_model'))
        return data

    @staticmethod
    def _render_model_usable(rm) -> bool:
        """Gespeichertes Modell aus der DB — vermeidet teuren Neuaufbau bei jedem GET (große Blätter)."""
        if not isinstance(rm, dict):
            return False
        pages = rm.get('pages')
        return isinstance(pages, list) and len(pages) > 0

    @staticmethod
    def _content_snapshot_equal(a: dict, b: dict) -> bool:
        return json.dumps(a, sort_keys=True, default=str) == json.dumps(b, sort_keys=True, default=str)

    def update(self, instance, validated_data):
        content = validated_data.get('content')
        request = self.context.get('request')
        is_staff = bool(request and getattr(request.user, 'is_staff', False))
        MOD = Worksheet.LibraryModerationStatus
        listing_keys = ('library_listing_title', 'library_listing_topic', 'library_listing_description')
        listing_in = any(k in validated_data for k in listing_keys)
        has_planned_duration = 'planned_duration_minutes' in validated_data
        planned_duration_value = validated_data.pop('planned_duration_minutes') if has_planned_duration else None

        if 'library_public' in validated_data:
            wants = bool(validated_data['library_public'])
            if wants:
                lt, lk, ld = _resolve_worksheet_listing(instance, validated_data)
                if not lt or not lk or not ld:
                    raise serializers.ValidationError({
                        'detail': 'Für die Bibliothek sind öffentlicher Titel, Thema und Beschreibung erforderlich.',
                    })
                validated_data['library_listing_title'] = lt[:_LISTING_CAP_TITLE]
                validated_data['library_listing_topic'] = lk[:_LISTING_CAP_TOPIC]
                validated_data['library_listing_description'] = ld[:_LISTING_CAP_DESC]
                if is_staff:
                    validated_data['library_moderation_status'] = MOD.APPROVED
                    validated_data['library_public'] = True
                else:
                    validated_data['library_moderation_status'] = MOD.PENDING
                    validated_data['library_public'] = False
            else:
                validated_data['library_public'] = False
                validated_data['library_moderation_status'] = MOD.NONE
                validated_data['library_listing_title'] = ''
                validated_data['library_listing_topic'] = ''
                validated_data['library_listing_description'] = ''
        elif listing_in:
            lt, lk, ld = _resolve_worksheet_listing(instance, validated_data)
            mod = instance.library_moderation_status
            if mod in (MOD.PENDING, MOD.APPROVED) or instance.library_public:
                if not lt or not lk or not ld:
                    raise serializers.ValidationError({
                        'detail': (
                            'Öffentlicher Titel, Thema und Beschreibung dürfen für den Bibliotheksstatus '
                            'nicht leer sein.'
                        ),
                    })
            if 'library_listing_title' in validated_data:
                validated_data['library_listing_title'] = lt[:_LISTING_CAP_TITLE]
            if 'library_listing_topic' in validated_data:
                validated_data['library_listing_topic'] = lk[:_LISTING_CAP_TOPIC]
            if 'library_listing_description' in validated_data:
                validated_data['library_listing_description'] = ld[:_LISTING_CAP_DESC]

        was_catalog = instance.is_catalog_listed()
        prev_manual_rev: tuple[dict, dict, dict] | None = None
        if 'content' in validated_data:
            prev_manual_rev = (
                copy.deepcopy(instance.content) if isinstance(instance.content, dict) else {},
                copy.deepcopy(instance.render_model) if isinstance(instance.render_model, dict) else {},
                worksheet_metadata_snapshot(instance),
            )
        if isinstance(content, dict):
            c = copy.deepcopy(content)
            if _worksheet_content_is_creative_html(c):
                c, _ = repair_creative_html_worksheet(c, instance.page_setup)
            else:
                c, _ = apply_page_coalesce_to_content(c, page_setup=instance.page_setup)
                c, _ = apply_page_overflow_reflow(c, page_setup=instance.page_setup)
            validated_data['content'] = c
        instance = super().update(instance, validated_data)
        if has_planned_duration:
            meta = copy.deepcopy(instance.generation_meta) if isinstance(instance.generation_meta, dict) else {}
            if planned_duration_value is None:
                meta.pop('time_budget_minutes', None)
            else:
                meta['time_budget_minutes'] = int(planned_duration_value)
            instance.generation_meta = meta
            instance.save(update_fields=['generation_meta', 'updated_at'])
        if 'library_public' in validated_data:
            now_catalog = instance.is_catalog_listed()
            if now_catalog and not was_catalog:
                instance.library_published_at = timezone.now()
            elif not now_catalog:
                instance.library_published_at = None
            instance.save(update_fields=['library_published_at', 'updated_at'])
        if 'content' in validated_data:
            req = {
                'theme': (instance.render_model or {}).get('theme', 'neutral'),
                'creativity': (instance.render_model or {}).get('creativity', 'balanced'),
                'show_sheet_header': (instance.render_model or {}).get('show_sheet_header', True),
            }
            ic = instance.content if isinstance(instance.content, dict) else {}
            if _worksheet_content_is_creative_html(ic):
                instance.render_model=build_creative_html_render_model(
                    ic,
                    instance.page_setup,
                    req,
                )
            else:
                instance.render_model=build_render_model(
                    instance.content,
                    instance.page_setup,
                    instance.pattern,
                    req,
                )
            ct=instance.content.get('title') if isinstance(instance.content,dict) else None
            if ct:
                instance.title=str(ct)[:255]
            instance.save(update_fields=['render_model','title','updated_at'])
            if prev_manual_rev is not None:
                prev_c, prev_rm, prev_meta = prev_manual_rev
                new_c = instance.content if isinstance(instance.content, dict) else {}
                if not self._content_snapshot_equal(prev_c, new_c):
                    try:
                        u = resolve_worksheet_owner(request.user) if request else None
                    except ValueError:
                        u = None
                    append_manual_content_revision(
                        instance,
                        user=u,
                        prev_content=prev_c,
                        prev_render_model=prev_rm,
                        prev_meta=prev_meta,
                    )
        return instance


class WorksheetLibraryCommentSerializer(serializers.ModelSerializer):
    text = serializers.CharField(source='body', read_only=True)
    author_label = serializers.SerializerMethodField()

    class Meta:
        model = WorksheetLibraryComment
        fields = ('id', 'text', 'author_label', 'created_at')
        read_only_fields = fields

    @staticmethod
    def get_author_label(_obj: WorksheetLibraryComment) -> str:
        return 'Anonym'


class WorksheetLibraryCommentCreateSerializer(serializers.Serializer):
    text = serializers.CharField(required=True, max_length=2000, allow_blank=False)


def worksheet_library_entry_detail_dict(ws: Worksheet, request) -> dict:
    """Katalog-Felder plus Inhalt/Render-Modell für die Community-Vorschau."""
    ctx = {'request': request}
    lite = WorksheetLibraryEntrySerializer(ws, context=ctx)
    heavy = WorksheetSerializer(ws, context=ctx)
    out = dict(lite.data)
    d = dict(heavy.data)
    out['content'] = d['content']
    out['render_model'] = d['render_model']
    out['page_setup'] = d['page_setup']
    return out


class WorksheetRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorksheetRevision
        fields = (
            'id',
            'worksheet',
            'prompt',
            'revision_mode',
            'previous_content',
            'new_content',
            'previous_render_model',
            'new_render_model',
            'previous_metadata',
            'new_metadata',
            'ai_raw_output',
            'validation_errors',
            'validation_warnings',
            'created_at',
            'created_by',
        )
        read_only_fields = fields


class WorksheetLibraryEntrySerializer(serializers.ModelSerializer):
    """Leichtgewichtiger Katalog-Eintrag (ohne content/volles render_model)."""

    kind = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    topic = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    grade = serializers.SerializerMethodField()
    owner_label = serializers.SerializerMethodField()
    viewer_is_owner = serializers.SerializerMethodField()
    planned_duration_minutes = serializers.SerializerMethodField()
    page_setup = serializers.JSONField(read_only=True)
    thumbnail_render_model = serializers.SerializerMethodField()
    avg_rating = serializers.FloatField(read_only=True, allow_null=True)
    rating_count = serializers.IntegerField(read_only=True, required=False, default=0)
    comment_count = serializers.IntegerField(read_only=True, required=False, default=0)
    my_stars = serializers.SerializerMethodField()

    class Meta:
        model = Worksheet
        fields = (
            'kind',
            'id',
            'title',
            'subject',
            'grade',
            'topic',
            'description',
            'planned_duration_minutes',
            'library_published_at',
            'owner_label',
            'viewer_is_owner',
            'page_setup',
            'thumbnail_render_model',
            'avg_rating',
            'rating_count',
            'comment_count',
            'my_stars',
        )

    def get_my_stars(self, obj: Worksheet) -> int | None:
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return None
        r = WorksheetRating.objects.filter(worksheet=obj, user=request.user).first()
        return r.stars if r else None

    def get_kind(self, obj: Worksheet) -> str:
        return 'worksheet'

    @staticmethod
    def get_title(obj: Worksheet) -> str:
        pub = (obj.library_listing_title or '').strip()
        return pub if pub else (obj.title or '')

    @staticmethod
    def get_topic(obj: Worksheet) -> str:
        pub = (obj.library_listing_topic or '').strip()
        return pub if pub else (obj.topic or '')

    @staticmethod
    def get_description(obj: Worksheet) -> str:
        return (obj.library_listing_description or '').strip()

    def get_grade(self, obj: Worksheet) -> str:
        return str(obj.grade) if obj.grade is not None else ''

    def get_owner_label(self, obj: Worksheet) -> str:
        o = obj.owner
        if not o:
            return ''
        full = (o.get_full_name() or '').strip()
        if full:
            return full
        if o.username:
            return o.username
        return (o.email or '').split('@')[0] or 'Unbekannt'

    def get_viewer_is_owner(self, obj: Worksheet) -> bool:
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return False
        return obj.owner_id == request.user.id

    def get_planned_duration_minutes(self, obj: Worksheet) -> int | None:
        return _planned_duration_from_worksheet(obj)

    @staticmethod
    def get_thumbnail_render_model(obj: Worksheet) -> dict | None:
        return first_page_render_model_for_thumbnail(obj.render_model)
