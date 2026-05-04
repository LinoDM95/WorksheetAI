"""Backwards-compat-Wrapper.

Logik in :class:`PageRegenerator` (``services/pipeline.py``).
"""
from __future__ import annotations

from .pipeline import PageRegenerator

__all__ = ['regenerate_worksheet_page', 'PageRegenerator']


def regenerate_worksheet_page(
    worksheet,
    page_index: int,
    teacher_instruction: str = '',
    content: dict | None = None,
):
    """:returns: ``(content, render_model, validation_notes)``"""
    return PageRegenerator(worksheet, page_index, teacher_instruction, content).run()
