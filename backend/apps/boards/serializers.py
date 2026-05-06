from django.db.models import Avg, Count
from rest_framework import serializers

from .models import Board, BoardFolder, BoardLibraryComment, BoardRating, BoardRevision
from .owner import resolve_board_owner
from .services.board_revision_head import board_matches_revision_head, latest_revision


class BoardFolderBriefSerializer(serializers.ModelSerializer):
    path = serializers.CharField(source='path_label', read_only=True)

    class Meta:
        model = BoardFolder
        fields = ('id', 'path')
        read_only_fields = fields


class BoardListSerializer(serializers.ModelSerializer):
    folder = BoardFolderBriefSerializer(read_only=True)
    source_board = serializers.UUIDField(source='source_board_id', read_only=True, allow_null=True)

    class Meta:
        model = Board
        fields = (
            'id', 'title', 'subject', 'grade', 'topic',
            'board_type', 'status',
            'used_libraries',
            'folder',
            'source_board',
            'library_public',
            'student_link_enabled',
            'created_at', 'updated_at',
        )
        read_only_fields = fields


class BoardDetailSerializer(serializers.ModelSerializer):
    folder = BoardFolderBriefSerializer(read_only=True)
    source_board = serializers.UUIDField(source='source_board_id', read_only=True, allow_null=True)
    avg_rating = serializers.SerializerMethodField()
    rating_count = serializers.SerializerMethodField()
    my_stars = serializers.SerializerMethodField()
    revision_head_id = serializers.SerializerMethodField()
    can_revise_with_ai = serializers.SerializerMethodField()

    class Meta:
        model = Board
        fields = (
            'id', 'title', 'description', 'subject', 'grade', 'topic',
            'board_type', 'status',
            'revision_head_id', 'can_revise_with_ai',
            'html', 'css', 'javascript',
            'teacher_notes', 'usage_instructions', 'warnings',
            'used_libraries', 'used_assets', 'used_datasets',
            'generation_prompt', 'generation_input',
            'validation_errors', 'validation_warnings',
            # Smartboard Pipeline-Artefakte
            'creative_brief', 'style_dna', 'intent_analysis', 'risk_analysis',
            'quality_report', 'browser_test_result', 'touch_audit_result',
            'screenshot_quality_result', 'repair_history',
            'used_model_config', 'token_usage', 'estimated_cost',
            'is_quality_example', 'quality_tags', 'reuse_pattern_summary',
            'assets_summary',
            'folder',
            'share_token', 'student_link_enabled', 'student_link_expires_at', 'library_public',
            'library_published_at', 'source_board',
            'avg_rating', 'rating_count', 'my_stars',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'created_at', 'updated_at',
            'generation_prompt', 'generation_input',
            'validation_errors', 'validation_warnings',
            'used_libraries', 'used_assets', 'used_datasets',
            'creative_brief', 'style_dna', 'intent_analysis', 'risk_analysis',
            'quality_report', 'browser_test_result', 'touch_audit_result',
            'screenshot_quality_result', 'repair_history',
            'used_model_config', 'token_usage', 'estimated_cost',
            'reuse_pattern_summary',
            'assets_summary',
            'folder',
            'share_token', 'library_published_at', 'student_link_expires_at', 'source_board',
            'avg_rating', 'rating_count', 'my_stars',
            'revision_head_id', 'can_revise_with_ai',
        )

    def get_revision_head_id(self, obj: Board):
        r = latest_revision(obj)
        return str(r.pk) if r else None

    def get_can_revise_with_ai(self, obj: Board):
        return board_matches_revision_head(obj)

    def get_avg_rating(self, obj: Board):
        agg = obj.ratings.aggregate(a=Avg('stars'))
        v = agg['a']
        return round(float(v), 2) if v is not None else None

    def get_rating_count(self, obj: Board):
        return obj.ratings.count()

    def get_my_stars(self, obj: Board):
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return None
        r = BoardRating.objects.filter(board=obj, user=request.user).first()
        return r.stars if r else None


class BoardLibraryEntrySerializer(serializers.ModelSerializer):
    avg_rating = serializers.FloatField(read_only=True, allow_null=True)
    rating_count = serializers.IntegerField(read_only=True)
    comment_count = serializers.IntegerField(read_only=True, default=0)
    my_stars = serializers.SerializerMethodField()
    owner_label = serializers.SerializerMethodField()
    viewer_is_owner = serializers.SerializerMethodField()
    share_token = serializers.SerializerMethodField()
    student_link_enabled = serializers.SerializerMethodField()

    class Meta:
        model = Board
        fields = (
            'id', 'title', 'description', 'subject', 'grade', 'topic',
            'html', 'css', 'javascript',
            'used_libraries', 'used_datasets',
            'library_published_at',
            'avg_rating', 'rating_count', 'comment_count', 'my_stars',
            'owner_label', 'viewer_is_owner',
            'share_token', 'student_link_enabled',
        )
        read_only_fields = fields

    def get_my_stars(self, obj: Board):
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return None
        rt = BoardRating.objects.filter(board=obj, user=request.user).first()
        return rt.stars if rt else None

    def get_owner_label(self, obj: Board):
        o = obj.owner
        if not o:
            return ''
        full = (o.get_full_name() or '').strip()
        if full:
            return full
        if o.username:
            return o.username
        return (o.email or '').split('@')[0] or 'Unbekannt'

    def get_viewer_is_owner(self, obj: Board):
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return False
        return obj.owner_id == request.user.id

    def get_share_token(self, obj: Board):
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return None
        if obj.owner_id != request.user.id:
            return None
        return obj.share_token

    def get_student_link_enabled(self, obj: Board):
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return False
        if obj.owner_id != request.user.id:
            return False
        return bool(obj.student_link_enabled)


class BoardLibraryCommentSerializer(serializers.ModelSerializer):
    """Ausgabe: nur Pseudonym für die Öffentlichkeit."""

    author_label = serializers.SerializerMethodField()
    text = serializers.CharField(source='body', read_only=True)

    class Meta:
        model = BoardLibraryComment
        fields = ('id', 'text', 'created_at', 'author_label')
        read_only_fields = fields

    def get_author_label(self, obj: BoardLibraryComment) -> str:
        return 'Anonym'


class BoardLibraryCommentCreateSerializer(serializers.Serializer):
    text = serializers.CharField(min_length=1, max_length=2000, trim_whitespace=True)


class BoardFolderSerializer(serializers.ModelSerializer):
    path = serializers.CharField(source='path_label', read_only=True)

    class Meta:
        model = BoardFolder
        fields = ('id', 'parent', 'name', 'sort_order', 'path')
        read_only_fields = ('id', 'path')

    def validate_parent(self, value):
        if value is None:
            return value
        request = self.context.get('request')
        if not request:
            return value
        owner = resolve_board_owner(request.user)
        if value.owner_id != owner.id:
            raise serializers.ValidationError('Ungültiger übergeordneter Ordner.')
        return value

    def validate(self, attrs):
        if 'parent' not in attrs:
            return attrs
        parent = attrs['parent']
        instance = getattr(self, 'instance', None)
        if instance is not None and parent is not None:
            walk = parent
            while walk is not None:
                if walk.pk == instance.pk:
                    raise serializers.ValidationError(
                        {'parent': 'Ein Ordner kann nicht sich selbst oder seine Unterordner überordnen.'},
                    )
                walk = walk.parent
        return attrs


class BoardRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardRevision
        fields = (
            'id', 'board', 'prompt', 'revision_mode',
            'previous_html', 'previous_css', 'previous_javascript',
            'new_html', 'new_css', 'new_javascript',
            'previous_metadata', 'new_metadata',
            'validation_errors', 'validation_warnings',
            'quality_report_before', 'quality_report_after',
            'repair_notes', 'used_model_config', 'token_usage',
            'created_at', 'created_by',
        )
        read_only_fields = fields
