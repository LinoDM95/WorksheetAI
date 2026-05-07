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


def _planned_duration_from_generation_input(gi: dict) -> int | None:
    if not isinstance(gi, dict):
        return None
    raw = gi.get('duration_minutes')
    if raw is None:
        return None
    try:
        v = int(raw)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def copy_live_classification_to_library_snapshot(board: Board) -> None:
    board.library_snapshot_subject = board.subject or ''
    board.library_snapshot_grade = board.grade or ''
    board.library_snapshot_grade_from = board.grade_from
    board.library_snapshot_grade_to = board.grade_to
    gi = board.generation_input if isinstance(board.generation_input, dict) else {}
    board.library_snapshot_duration_minutes = _planned_duration_from_generation_input(gi)


def copy_live_bundle_to_library_snapshot(board: Board) -> None:
    board.library_snapshot_html = board.html or ''
    board.library_snapshot_css = board.css or ''
    board.library_snapshot_javascript = board.javascript or ''
    board.library_snapshot_used_libraries = list(board.used_libraries or [])
    board.library_snapshot_used_datasets = list(board.used_datasets or [])
    copy_live_classification_to_library_snapshot(board)
    board.library_snapshot_at = timezone.now()


def catalog_display_subject(board: Board) -> str:
    if getattr(board, 'library_snapshot_at', None) is None:
        return board.subject or ''
    return (getattr(board, 'library_snapshot_subject', '') or '')[:120]


def catalog_display_grade_label(board: Board) -> str:
    if getattr(board, 'library_snapshot_at', None) is None:
        return board.grade or ''
    return (getattr(board, 'library_snapshot_grade', '') or '')[:60]


def catalog_display_grade_from(board: Board) -> int | None:
    if getattr(board, 'library_snapshot_at', None) is None:
        return board.grade_from
    return getattr(board, 'library_snapshot_grade_from', None)


def catalog_display_grade_to(board: Board) -> int | None:
    if getattr(board, 'library_snapshot_at', None) is None:
        return board.grade_to
    return getattr(board, 'library_snapshot_grade_to', None)


def catalog_display_duration_minutes(board: Board) -> int | None:
    if getattr(board, 'library_snapshot_at', None) is None:
        gi = board.generation_input if isinstance(board.generation_input, dict) else {}
        return _planned_duration_from_generation_input(gi)
    v = getattr(board, 'library_snapshot_duration_minutes', None)
    if v is None:
        return None
    return int(v) if v > 0 else None


def public_listing_differs_from_live(board: Board) -> bool:
    if public_bundle_differs_from_live(board):
        return True
    if not board.is_catalog_listed():
        return False
    if getattr(board, 'library_snapshot_at', None) is None:
        return False
    if (board.subject or '') != (board.library_snapshot_subject or ''):
        return True
    if (board.grade or '') != (board.library_snapshot_grade or ''):
        return True
    if board.grade_from != board.library_snapshot_grade_from:
        return True
    if board.grade_to != board.library_snapshot_grade_to:
        return True
    live_dur = _planned_duration_from_generation_input(
        board.generation_input if isinstance(board.generation_input, dict) else {},
    )
    snap_dur = board.library_snapshot_duration_minutes
    if live_dur != snap_dur:
        return True
    return False
