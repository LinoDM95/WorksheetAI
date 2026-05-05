"""Kanonische Bundesländer-Stammdaten + Berlin&Brandenburg-Replikationsmarker.

Ein Slug wie ``berlin_brandenburg`` ist eine Sonderoption: Es wird nur einmal
extrahiert, der spätere Approval-Run legt aber je einen ``CurriculumContext``
pro tatsächlichem Bundesland (Berlin und Brandenburg) an.
"""
from __future__ import annotations

from typing import Iterable

GERMAN_FEDERAL_STATES: list[tuple[str, str]] = [
    ('baden_wuerttemberg', 'Baden-Württemberg'),
    ('bayern', 'Bayern'),
    ('berlin', 'Berlin'),
    ('brandenburg', 'Brandenburg'),
    ('bremen', 'Bremen'),
    ('hamburg', 'Hamburg'),
    ('hessen', 'Hessen'),
    ('mecklenburg_vorpommern', 'Mecklenburg-Vorpommern'),
    ('niedersachsen', 'Niedersachsen'),
    ('nordrhein_westfalen', 'Nordrhein-Westfalen'),
    ('rheinland_pfalz', 'Rheinland-Pfalz'),
    ('saarland', 'Saarland'),
    ('sachsen', 'Sachsen'),
    ('sachsen_anhalt', 'Sachsen-Anhalt'),
    ('schleswig_holstein', 'Schleswig-Holstein'),
    ('thueringen', 'Thüringen'),
]

BERLIN_BRANDENBURG_SLUG = 'berlin_brandenburg'
BERLIN_BRANDENBURG_LABEL = 'Berlin & Brandenburg (gemeinsamer RLP)'
BERLIN_BRANDENBURG_DISPLAY = 'Berlin/Brandenburg'
BERLIN_BRANDENBURG_REPLICATE: list[str] = ['Berlin', 'Brandenburg']


SLUG_TO_NAME: dict[str, str] = {slug: name for slug, name in GERMAN_FEDERAL_STATES}
NAME_TO_SLUG: dict[str, str] = {name.lower(): slug for slug, name in GERMAN_FEDERAL_STATES}


def all_state_options() -> list[dict[str, object]]:
    """Liste für Dropdown inkl. Berlin&Brandenburg-Spezialeintrag."""
    options: list[dict[str, object]] = [
        {
            'slug': BERLIN_BRANDENBURG_SLUG,
            'name': BERLIN_BRANDENBURG_DISPLAY,
            'label': BERLIN_BRANDENBURG_LABEL,
            'replicate_states': list(BERLIN_BRANDENBURG_REPLICATE),
        },
    ]
    for slug, name in GERMAN_FEDERAL_STATES:
        options.append(
            {
                'slug': slug,
                'name': name,
                'label': name,
                'replicate_states': [],
            },
        )
    return options


def resolve_state(value: str | None) -> tuple[str, list[str]]:
    """Gibt (Anzeige-State, Replikations-Liste) zurück.

    Akzeptiert Slug oder Klartext-Bundesland; bei Berlin&Brandenburg
    wird ``state='Berlin/Brandenburg'`` und ``replicate_states=['Berlin', 'Brandenburg']``
    zurückgegeben.
    """
    raw = (value or '').strip()
    if not raw:
        return '', []
    slug = raw.lower().replace(' ', '_').replace('-', '_').replace('/', '_').replace('&', '_')
    slug = slug.replace('__', '_').strip('_')
    if slug == BERLIN_BRANDENBURG_SLUG or raw.lower() in {
        BERLIN_BRANDENBURG_DISPLAY.lower(),
        'berlin und brandenburg',
        'berlin & brandenburg',
        'berlin&brandenburg',
        'berlin-brandenburg',
    }:
        return BERLIN_BRANDENBURG_DISPLAY, list(BERLIN_BRANDENBURG_REPLICATE)
    if slug in SLUG_TO_NAME:
        return SLUG_TO_NAME[slug], []
    direct = NAME_TO_SLUG.get(raw.lower())
    if direct:
        return SLUG_TO_NAME[direct], []
    return raw, []


def is_known_state(value: str) -> bool:
    name, replicate = resolve_state(value)
    if replicate:
        return True
    return name.lower() in NAME_TO_SLUG


def normalize_replicate(values: Iterable[str] | None) -> list[str]:
    out: list[str] = []
    if not values:
        return out
    for v in values:
        s = (v or '').strip()
        if not s:
            continue
        name, _ = resolve_state(s)
        if name and name not in out:
            out.append(name)
    return out
