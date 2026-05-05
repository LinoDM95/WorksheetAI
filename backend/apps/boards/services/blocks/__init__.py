"""Bausteinmodus für interaktive Tafelbilder.

Deterministische, geprüfte HTML/CSS/JS-Templates pro Baustein. Die KI darf hier
*keinen* Code generieren — nur (optional) Theme/Mikrotexte/Hinweise als JSON.

Public API:
    BLOCKS               – kuratierte Liste der v1-Bausteine
    BLOCK_BY_ID          – schnelles Lookup
    THEMES               – kuratierte Theme-Tokens
    THEME_BY_ID          – Lookup
    DEFAULT_THEME_ID     – Fallback
    PAGE_BLOCK_LIMIT     – max. Bausteine pro Seite
    PAGE_UNIT_BUDGET     – max. size_weight pro Seite
    MAX_PAGES            – max. Seiten gesamt
    CompositionSpec      – Pydantic-Schema für die gesamte Spec
    ValidationError      – Fehler aus dem Validator
    validate_spec        – Spec-Eingangsprüfung
    compose_board        – Spec + Theme → vollständiges Sandbox-Bundle
"""
from __future__ import annotations

from .registry import BLOCK_BY_ID, BLOCKS, BlockDefinition
from .themes import DEFAULT_THEME_ID, THEME_BY_ID, THEMES, Theme
from .compose import compose_board
from .validators import (
    MAX_PAGES,
    PAGE_BLOCK_LIMIT,
    PAGE_UNIT_BUDGET,
    BlockInstanceSpec,
    BlockSlotSpec,
    CompositionPlan,
    CompositionSpec,
    PagePlan,
    PageSpec,
    SpecValidationError,
    validate_plan,
    validate_spec,
)

__all__ = [
    'BLOCKS',
    'BLOCK_BY_ID',
    'BlockDefinition',
    'THEMES',
    'THEME_BY_ID',
    'DEFAULT_THEME_ID',
    'Theme',
    'PAGE_BLOCK_LIMIT',
    'PAGE_UNIT_BUDGET',
    'MAX_PAGES',
    'CompositionPlan',
    'PagePlan',
    'BlockSlotSpec',
    'CompositionSpec',
    'PageSpec',
    'BlockInstanceSpec',
    'SpecValidationError',
    'validate_plan',
    'validate_spec',
    'compose_board',
]
