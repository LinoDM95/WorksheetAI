from django.contrib import admin

from .models import Board, BoardFolder, BoardRating, BoardRevision


@admin.register(BoardFolder)
class BoardFolderAdmin(admin.ModelAdmin):
    list_display = ('path_display', 'owner', 'sort_order')
    search_fields = ('name',)
    list_filter = ('owner',)
    raw_id_fields = ('parent',)

    @admin.display(description='Pfad')
    def path_display(self, obj: BoardFolder) -> str:
        return obj.path_label()


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = (
        'title', 'owner', 'subject', 'grade', 'board_type', 'status',
        'student_link_enabled', 'library_public', 'created_at',
    )
    search_fields = ('title', 'subject', 'topic', 'share_token')
    list_filter = ('board_type', 'status', 'student_link_enabled', 'library_public')
    readonly_fields = ('created_at', 'updated_at', 'share_token')


@admin.register(BoardRating)
class BoardRatingAdmin(admin.ModelAdmin):
    list_display = ('board', 'user', 'stars', 'updated_at')
    list_filter = ('stars',)
    raw_id_fields = ('board', 'user')


@admin.register(BoardRevision)
class BoardRevisionAdmin(admin.ModelAdmin):
    list_display = ('board', 'created_by', 'created_at')
    search_fields = ('board__title',)
    readonly_fields = ('created_at',)
