"""Backwards-compat-Wrapper.

Logik in :class:`PageRegenerator` (``services/pipeline.py``).
"""
from __future__ import annotations

import copy

from .pipeline import PageRegenerator

__all__ = ['regenerate_worksheet_page', 'regenerate_worksheet_pages', 'PageRegenerator']


def regenerate_worksheet_page(
    worksheet,
    page_index: int,
    teacher_instruction: str = '',
    content: dict | None = None,
):
    """:returns: ``(content, render_model, validation_notes)``"""
    return PageRegenerator(worksheet, page_index, teacher_instruction, content).run()


def regenerate_worksheet_pages(
    worksheet,
    page_indices: list[int],
    teacher_instruction: str = '',
    content: dict | None = None,
):
    """Mehrere Seiten nacheinander mit derselben Lehrkraft-Anweisung überarbeiten.

    :returns: ``(content, render_model, validation_notes)`` — Render-Modell nach der letzten Seite.
    """
    if not page_indices:
        raise ValueError('Mindestens eine Seite muss ausgewählt sein.')
    src = copy.deepcopy(content) if content is not None else copy.deepcopy(worksheet.content)
    if not isinstance(src, dict):
        raise ValueError('Ungültiger Arbeitsblatt-Inhalt')
    pages = src.get('pages')
    if not isinstance(pages, list) or len(pages) == 0:
        raise ValueError('Ungültiger Arbeitsblatt-Inhalt: keine Seiten.')
    n = len(pages)
    uniq = sorted({int(i) for i in page_indices})
    for i in uniq:
        if i < 0 or i >= n:
            raise ValueError(f'Ungültige Seitennummer: {i + 1} (Arbeitsblatt hat {n} Seiten).')
    all_notes: list[str] = []
    render_model: dict = {}
    for idx in uniq:
        src, render_model, notes = PageRegenerator(
            worksheet, idx, teacher_instruction, content=src
        ).run()
        all_notes.extend(notes or [])
    return src, render_model, all_notes
