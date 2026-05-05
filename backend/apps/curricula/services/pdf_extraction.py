"""Extrahiert Text pro PDF-Seite für CurriculumSource (PyMuPDF, Fallback pypdf)."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_PREVIEW_MAX = 500


def _extract_with_pymupdf(file_path: str) -> list[dict[str, Any]]:
    import fitz

    doc = fitz.open(file_path)
    out: list[dict[str, Any]] = []
    try:
        for i in range(doc.page_count):
            page = doc.load_page(i)
            text = page.get_text() or ''
            text = text.strip()
            char_count = len(text)
            preview = text[:_PREVIEW_MAX] if text else ''
            out.append(
                {
                    'page': i + 1,
                    'text': text,
                    'char_count': char_count,
                    'preview_text': preview,
                    'has_text': bool(text),
                },
            )
    finally:
        doc.close()
    return out


def _extract_with_pypdf(file_path: str) -> list[dict[str, Any]]:
    from pypdf import PdfReader

    reader = PdfReader(file_path)
    out: list[dict[str, Any]] = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ''
        text = text.strip()
        char_count = len(text)
        preview = text[:_PREVIEW_MAX] if text else ''
        out.append(
            {
                'page': i + 1,
                'text': text,
                'char_count': char_count,
                'preview_text': preview,
                'has_text': bool(text),
            },
        )
    return out


class CurriculumPDFExtractionService:
    @staticmethod
    def extract_pdf_pages(file_path: str) -> list[dict[str, Any]]:
        try:
            return _extract_with_pymupdf(file_path)
        except Exception as exc:
            logger.warning('PyMuPDF extraction failed, trying pypdf: %s', exc)
            return _extract_with_pypdf(file_path)

    @classmethod
    def extract_source(cls, source) -> Any:
        from apps.curricula.models import CurriculumSource

        assert isinstance(source, CurriculumSource)
        source.extraction_status = CurriculumSource.EXTRACTION_WORKING
        source.extraction_error = ''
        source.save(update_fields=['extraction_status', 'extraction_error', 'updated_at'])
        try:
            path = source.file.path
            pages = cls.extract_pdf_pages(path)
            source.extracted_pages = pages
            source.page_count = len(pages)
            source.extraction_status = CurriculumSource.EXTRACTION_DONE
            source.save(
                update_fields=['extracted_pages', 'page_count', 'extraction_status', 'extraction_error', 'updated_at'],
            )
        except Exception as exc:
            logger.exception('Curriculum PDF extraction failed')
            source.extraction_status = CurriculumSource.EXTRACTION_FAILED
            source.extraction_error = str(exc)[:8000]
            source.save(update_fields=['extraction_status', 'extraction_error', 'updated_at'])
        return source
