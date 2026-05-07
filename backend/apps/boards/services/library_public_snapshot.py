"""Festhalten der Bibliotheksversion (öffentliche Karten-/Vorschau-Daten vs. Privat-Arbeitsstand)."""

from __future__ import annotations

from django.utils import timezone

from apps.boards.models import Board


def listing_display_title(board: Board) -> str:
    t = (getattr(board, 'library_listing_title', '') or '').strip()
    return t if t else (board.title or '')


def listing_display_topic(board: Board) -> str:
    t = (getattr(board, 'library_listing_topic', '') or '').strip()
    return t if t else (board.topic or '')


def listing_display_description(board: Board) -> str:
    return (getattr(board, 'library_listing_description', '') or '').strip()


def bundle_for_library_preview(board: Board) -> tuple[str, str, str, list, list]:
    """HTML/CSS/JS und Libs wie in Community-Vorschau / Übernehmen aus Bibliothek."""
    if getattr(board, 'library_snapshot_at', None) is not None:
        return (
            board.library_snapshot_html or '',
            board.library_snapshot_css or '',
            board.library_snapshot_javascript or '',
            list(board.library_snapshot_used_libraries or []),
            list(board.library_snapshot_used_datasets or []),
        )
    return (
        board.html or '',
        board.css or '',
        board.javascript or '',
        list(board.used_libraries or []),
        list(board.used_datasets or []),
    )


def public_bundle_differs_from_live(board: Board) -> bool:
    if not board.is_catalog_listed():
        return False
    if getattr(board, 'library_snapshot_at', None) is None:
        return False
    h, c, j, libs, ds = bundle_for_library_preview(board)
    return (
        (board.html or '') != h
        or (board.css or '') != c
        or (board.javascript or '') != j
        or list(board.used_libraries or []) != libs
        or list(board.used_datasets or []) != ds
    )


def copy_live_bundle_to_library_snapshot(board: Board) -> None:
    board.library_snapshot_html = board.html or ''
    board.library_snapshot_css = board.css or ''
    board.library_snapshot_javascript = board.javascript or ''
    board.library_snapshot_used_libraries = list(board.used_libraries or [])
    board.library_snapshot_used_datasets = list(board.used_datasets or [])
    board.library_snapshot_at = timezone.now()
