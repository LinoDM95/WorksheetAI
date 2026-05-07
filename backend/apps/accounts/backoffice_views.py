"""API für Staff (``is_staff``): Bibliotheks-Freigaben und Moderation."""

from __future__ import annotations

from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.boards.models import Board
from apps.boards.serializers import BoardDetailSerializer, BoardLibraryEntrySerializer
from apps.boards.services.library_public_snapshot import copy_live_bundle_to_library_snapshot
from apps.worksheets.models import Worksheet
from apps.worksheets.serializers import WorksheetLibraryEntrySerializer, WorksheetSerializer


class IsStaffUser(BasePermission):
    def has_permission(self, request, view) -> bool:
        u = request.user
        return bool(u and getattr(u, 'is_authenticated', False) and getattr(u, 'is_staff', False))


def _pending_boards_qs():
    return (
        Board.objects.filter(library_moderation_status=Board.LibraryModerationStatus.PENDING)
        .select_related('owner')
        .annotate(
            avg_rating=Avg('ratings__stars'),
            rating_count=Count('ratings', distinct=True),
            comment_count=Count('library_comments', distinct=True),
        )
        .order_by('-updated_at')[:200]
    )


class BackofficeBoardPreviewView(APIView):
    """Live-HTML/CSS/JS eines Boards zur Prüfung vor Bibliotheks-Freigabe (nur ausstehende Einreichung)."""

    permission_classes = [IsStaffUser]

    def get(self, request, pk):
        board = Board.objects.filter(pk=pk).first()
        if not board:
            return Response({'detail': 'Nicht gefunden.'}, status=404)
        if board.library_moderation_status != Board.LibraryModerationStatus.PENDING:
            return Response({'detail': 'Für dieses Board liegt keine Einreichung zur Freigabe vor.'}, status=400)
        return Response(
            {
                'title': board.title or '',
                'board_type': board.board_type,
                'html': board.html or '',
                'css': board.css or '',
                'javascript': board.javascript or '',
                'used_libraries': list(board.used_libraries or []),
                'used_datasets': list(board.used_datasets or []),
            },
        )


class BackofficeWorksheetPreviewView(APIView):
    """Arbeitsblatt-Rohdaten (content) zur Prüfung vor Bibliotheks-Freigabe."""

    permission_classes = [IsStaffUser]

    def get(self, request, pk):
        ws = Worksheet.objects.filter(pk=pk).select_related('pattern').first()
        if not ws:
            return Response({'detail': 'Nicht gefunden.'}, status=404)
        if ws.library_moderation_status != Worksheet.LibraryModerationStatus.PENDING:
            return Response(
                {'detail': 'Für dieses Arbeitsblatt liegt keine Einreichung zur Freigabe vor.'},
                status=400,
            )
        pattern_key = None
        if ws.pattern_id and ws.pattern:
            pattern_key = getattr(ws.pattern, 'key', None)
        return Response(
            {
                'title': ws.title or '',
                'subject': ws.subject or '',
                'grade': ws.grade,
                'topic': ws.topic or '',
                'pattern_key': pattern_key,
                'page_setup': ws.page_setup if isinstance(ws.page_setup, dict) else {},
                'content': ws.content if isinstance(ws.content, dict) else {},
            },
        )


class BackofficePendingView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        boards = _pending_boards_qs()
        worksheets = (
            Worksheet.objects.filter(library_moderation_status=Worksheet.LibraryModerationStatus.PENDING)
            .select_related('owner', 'pattern')
            .order_by('-updated_at')[:200]
        )
        return Response(
            {
                'boards': BoardLibraryEntrySerializer(boards, many=True, context={'request': request}).data,
                'worksheets': WorksheetLibraryEntrySerializer(worksheets, many=True, context={'request': request}).data,
            },
        )


class BackofficeBoardApproveView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        board = Board.objects.filter(pk=pk).first()
        if not board:
            return Response({'detail': 'Nicht gefunden.'}, status=404)
        board.library_moderation_status = Board.LibraryModerationStatus.APPROVED
        board.library_public = True
        board.library_published_at = timezone.now()
        copy_live_bundle_to_library_snapshot(board)
        board.save(
            update_fields=[
                'library_moderation_status',
                'library_public',
                'library_published_at',
                'library_snapshot_html',
                'library_snapshot_css',
                'library_snapshot_javascript',
                'library_snapshot_used_libraries',
                'library_snapshot_used_datasets',
                'library_snapshot_at',
                'updated_at',
            ],
        )
        return Response(BoardDetailSerializer(board, context={'request': request}).data)


class BackofficeBoardRejectView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        board = Board.objects.filter(pk=pk).first()
        if not board:
            return Response({'detail': 'Nicht gefunden.'}, status=404)
        board.library_moderation_status = Board.LibraryModerationStatus.REJECTED
        board.library_public = False
        board.library_published_at = None
        board.save(
            update_fields=['library_moderation_status', 'library_public', 'library_published_at', 'updated_at'],
        )
        return Response(BoardDetailSerializer(board, context={'request': request}).data)


class BackofficeBoardUnpublishView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        board = Board.objects.filter(pk=pk).first()
        if not board:
            return Response({'detail': 'Nicht gefunden.'}, status=404)
        board.library_moderation_status = Board.LibraryModerationStatus.NONE
        board.library_public = False
        board.library_published_at = None
        board.save(
            update_fields=['library_moderation_status', 'library_public', 'library_published_at', 'updated_at'],
        )
        return Response(BoardDetailSerializer(board, context={'request': request}).data)


class BackofficeBoardDestroyView(APIView):
    permission_classes = [IsStaffUser]

    def delete(self, request, pk):
        board = Board.objects.filter(pk=pk).first()
        if not board:
            return Response({'detail': 'Nicht gefunden.'}, status=404)
        board.delete()
        return Response(status=204)


class BackofficeWorksheetApproveView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        ws = Worksheet.objects.filter(pk=pk).first()
        if not ws:
            return Response({'detail': 'Nicht gefunden.'}, status=404)
        ws.library_moderation_status = Worksheet.LibraryModerationStatus.APPROVED
        ws.library_public = True
        ws.library_published_at = timezone.now()
        ws.save(update_fields=['library_moderation_status', 'library_public', 'library_published_at', 'updated_at'])
        return Response(WorksheetSerializer(ws, context={'request': request}).data)


class BackofficeWorksheetRejectView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        ws = Worksheet.objects.filter(pk=pk).first()
        if not ws:
            return Response({'detail': 'Nicht gefunden.'}, status=404)
        ws.library_moderation_status = Worksheet.LibraryModerationStatus.REJECTED
        ws.library_public = False
        ws.library_published_at = None
        ws.save(update_fields=['library_moderation_status', 'library_public', 'library_published_at', 'updated_at'])
        return Response(WorksheetSerializer(ws, context={'request': request}).data)


class BackofficeWorksheetUnpublishView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        ws = Worksheet.objects.filter(pk=pk).first()
        if not ws:
            return Response({'detail': 'Nicht gefunden.'}, status=404)
        ws.library_moderation_status = Worksheet.LibraryModerationStatus.NONE
        ws.library_public = False
        ws.library_published_at = None
        ws.save(update_fields=['library_moderation_status', 'library_public', 'library_published_at', 'updated_at'])
        return Response(WorksheetSerializer(ws, context={'request': request}).data)


class BackofficeWorksheetDestroyView(APIView):
    permission_classes = [IsStaffUser]

    def delete(self, request, pk):
        ws = Worksheet.objects.filter(pk=pk).first()
        if not ws:
            return Response({'detail': 'Nicht gefunden.'}, status=404)
        ws.delete()
        return Response(status=204)
