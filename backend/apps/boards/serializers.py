from django.db.models import Avg, Count
from rest_framework import serializers

from .models import Board, BoardFolder, BoardRating, BoardRevision
from .owner import resolve_board_owner


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

    class Meta:
        model = Board
        fields = (
            'id', 'title', 'description', 'subject', 'grade', 'topic',
            'board_type', 'status',
            'html', 'css', 'javascript',
            'teacher_notes', 'usage_instructions', 'warnings',
            'used_libraries', 'used_assets', 'used_datasets',
            'generation_prompt', 'generation_input',
            'validation_errors', 'validation_warnings',
            'folder',
            'share_token', 'student_link_enabled', 'library_public',
            'library_published_at', 'source_board',
            'avg_rating', 'rating_count', 'my_stars',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'created_at', 'updated_at',
            'generation_prompt', 'generation_input',
            'validation_errors', 'validation_warnings',
            'used_libraries', 'used_assets', 'used_datasets',
            'folder',
            'share_token', 'library_published_at', 'source_board',
            'avg_rating', 'rating_count', 'my_stars',
        )

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
    my_stars = serializers.SerializerMethodField()
    owner_label = serializers.SerializerMethodField()

    class Meta:
        model = Board
        fields = (
            'id', 'title', 'subject', 'grade', 'topic',
            'used_libraries', 'library_published_at',
            'avg_rating', 'rating_count', 'my_stars', 'owner_label',
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
            'id', 'board', 'prompt',
            'previous_html', 'previous_css', 'previous_javascript',
            'new_html', 'new_css', 'new_javascript',
            'previous_metadata', 'new_metadata',
            'validation_errors', 'validation_warnings',
            'created_at', 'created_by',
        )
        read_only_fields = fields
