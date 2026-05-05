"""Pydantic-Eingangsprüfung für Bausteinmodus.

Es gibt zwei verwandte Schemas:

* ``CompositionPlan`` — was der Wizard schickt:
    Stichpunkte pro Seite + Block-Slots **ohne** Inhalt. Die KI füllt die
    Bausteine danach aus.
* ``CompositionSpec`` — interne Struktur, die ``compose_board`` rendert:
    Bausteine **mit** validiertem Pydantic-Content.

Limits:
  * MAX_PAGES         — max. Seiten gesamt
  * PAGE_BLOCK_LIMIT  — max. Bausteine pro Seite (Stückzahl)
  * PAGE_UNIT_BUDGET  — max. Summe der size_weights pro Seite
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator


MAX_PAGES = 12
PAGE_BLOCK_LIMIT = 6
PAGE_UNIT_BUDGET = 10
MAX_PAGE_BULLETS = 20
MAX_BULLET_LEN = 300
MAX_HINT_LEN = 200


class SpecValidationError(ValueError):
    """Fehler bei der Spec-Validierung — enthält flache Liste deutscher Fehlermeldungen."""

    def __init__(self, errors: list[str]):
        self.errors = list(errors)
        super().__init__('; '.join(self.errors))


# ---------------------------------------------------------------------------
# Plan (Wizard-Eingabe)
# ---------------------------------------------------------------------------
class BlockSlotSpec(BaseModel):
    """Ein Platz für einen Baustein — Inhalt füllt die KI."""

    instance_id: str = Field(default='', max_length=64)
    block_id: str
    hint: str = Field(default='', max_length=MAX_HINT_LEN)


class PagePlan(BaseModel):
    title: str = Field(default='', max_length=120)
    bullets: list[str] = Field(default_factory=list)
    block_slots: list[BlockSlotSpec] = Field(default_factory=list)

    @field_validator('bullets')
    @classmethod
    def _clean_bullets(cls, v: list[str]) -> list[str]:
        cleaned = [str(x).strip()[:MAX_BULLET_LEN] for x in v if str(x).strip()]
        if len(cleaned) > MAX_PAGE_BULLETS:
            raise ValueError(f'Maximal {MAX_PAGE_BULLETS} Stichpunkte pro Seite')
        return cleaned


class CompositionPlan(BaseModel):
    """Eingangsformat des Wizards (was der Lehrer aus der UI sendet)."""

    subject: str = Field(default='', max_length=120)
    grade: str = Field(default='', max_length=60)
    topic: str = Field(default='', max_length=220)
    title: str = Field(default='', max_length=255)
    style_hint: str = Field(default='', max_length=300)
    theme_id: str = Field(default='auto', max_length=40)
    pages: list[PagePlan] = Field(default_factory=list)

    @field_validator('pages')
    @classmethod
    def _has_pages(cls, v: list[PagePlan]) -> list[PagePlan]:
        if not v:
            raise ValueError('Mindestens eine Seite ist erforderlich')
        if len(v) > MAX_PAGES:
            raise ValueError(f'Maximal {MAX_PAGES} Seiten erlaubt')
        return v


def _validate_plan_structure(plan: CompositionPlan) -> list[str]:
    from .registry import BLOCK_BY_ID

    errors: list[str] = []
    has_global_topic = bool(plan.topic.strip() or plan.title.strip())
    for p_idx, page in enumerate(plan.pages, start=1):
        if not page.block_slots:
            errors.append(f'Seite {p_idx}: mindestens ein Baustein nötig.')
        if len(page.block_slots) > PAGE_BLOCK_LIMIT:
            errors.append(
                f'Seite {p_idx}: max. {PAGE_BLOCK_LIMIT} Bausteine erlaubt, gefunden {len(page.block_slots)}.'
            )
        if not page.bullets and not has_global_topic:
            errors.append(
                f'Seite {p_idx}: mindestens ein Stichpunkt nötig (oder ein globales Thema/Titel angeben).'
            )
        unit_sum = 0
        for s_idx, slot in enumerate(page.block_slots, start=1):
            definition = BLOCK_BY_ID.get(slot.block_id)
            if definition is None:
                errors.append(
                    f'Seite {p_idx} Baustein {s_idx}: unbekannter Baustein "{slot.block_id}".'
                )
                continue
            unit_sum += definition.size_weight
        if unit_sum > PAGE_UNIT_BUDGET:
            errors.append(
                f'Seite {p_idx}: Layout-Budget überschritten ({unit_sum} / {PAGE_UNIT_BUDGET}).'
            )
    return errors


def validate_plan(raw: dict[str, Any]) -> CompositionPlan:
    """Validiert raw → CompositionPlan; wirft SpecValidationError bei Fehlern."""
    if not isinstance(raw, dict):
        raise SpecValidationError(['Plan muss ein Objekt sein.'])
    try:
        plan = CompositionPlan.model_validate(raw)
    except ValidationError as exc:
        errs: list[str] = []
        for err in exc.errors():
            loc = '.'.join(str(x) for x in err.get('loc', []))
            errs.append(f'{err.get("msg", "ungültig")} ({loc})'.strip())
        raise SpecValidationError(errs) from exc
    structural = _validate_plan_structure(plan)
    if structural:
        raise SpecValidationError(structural)
    return plan


# ---------------------------------------------------------------------------
# Spec (intern, nach KI-Filling)
# ---------------------------------------------------------------------------
class BlockInstanceSpec(BaseModel):
    """Eine fertige Bausteininstanz mit befülltem Content (für compose_board)."""

    instance_id: str = Field(default='', max_length=64)
    block_id: str
    content: dict[str, Any] = Field(default_factory=dict)


class PageSpec(BaseModel):
    title: str = Field(default='', max_length=120)
    blocks: list[BlockInstanceSpec] = Field(default_factory=list)


class CompositionSpec(BaseModel):
    """Interne Struktur, die compose_board rendert (Content bereits befüllt)."""

    subject: str = Field(default='', max_length=120)
    grade: str = Field(default='', max_length=60)
    topic: str = Field(default='', max_length=220)
    title: str = Field(default='', max_length=255)
    description: str = Field(default='', max_length=2000)
    theme_id: str = Field(default='auto', max_length=40)
    pages: list[PageSpec] = Field(default_factory=list)

    @field_validator('pages')
    @classmethod
    def _has_pages(cls, v: list[PageSpec]) -> list[PageSpec]:
        if not v:
            raise ValueError('Mindestens eine Seite ist erforderlich')
        if len(v) > MAX_PAGES:
            raise ValueError(f'Maximal {MAX_PAGES} Seiten erlaubt')
        return v


def _validate_pages_against_registry(spec: CompositionSpec) -> list[str]:
    from .registry import BLOCK_BY_ID

    errors: list[str] = []
    for p_idx, page in enumerate(spec.pages, start=1):
        if len(page.blocks) == 0:
            errors.append(f'Seite {p_idx}: mindestens ein Baustein nötig.')
            continue
        if len(page.blocks) > PAGE_BLOCK_LIMIT:
            errors.append(
                f'Seite {p_idx}: max. {PAGE_BLOCK_LIMIT} Bausteine erlaubt, gefunden {len(page.blocks)}.'
            )
        unit_sum = 0
        for b_idx, block in enumerate(page.blocks, start=1):
            definition = BLOCK_BY_ID.get(block.block_id)
            if definition is None:
                errors.append(
                    f'Seite {p_idx} Baustein {b_idx}: unbekannter Baustein "{block.block_id}".'
                )
                continue
            unit_sum += definition.size_weight
            try:
                definition.content_schema.model_validate(block.content)
            except ValidationError as exc:
                for err in exc.errors():
                    loc = '.'.join(str(x) for x in err.get('loc', []))
                    errors.append(
                        f'Seite {p_idx} Baustein {b_idx} ({block.block_id}): '
                        f'{err.get("msg", "ungültig")} ({loc})'.strip()
                    )
        if unit_sum > PAGE_UNIT_BUDGET:
            errors.append(
                f'Seite {p_idx}: Layout-Budget überschritten ({unit_sum} / {PAGE_UNIT_BUDGET}).'
            )
    return errors


def validate_spec(raw: dict[str, Any]) -> CompositionSpec:
    """Validiert raw → CompositionSpec; wirft SpecValidationError bei Fehlern."""
    if not isinstance(raw, dict):
        raise SpecValidationError(['Spec muss ein Objekt sein.'])
    try:
        spec = CompositionSpec.model_validate(raw)
    except ValidationError as exc:
        errs: list[str] = []
        for err in exc.errors():
            loc = '.'.join(str(x) for x in err.get('loc', []))
            errs.append(f'{err.get("msg", "ungültig")} ({loc})'.strip())
        raise SpecValidationError(errs) from exc
    page_errs = _validate_pages_against_registry(spec)
    if page_errs:
        raise SpecValidationError(page_errs)
    return spec
