"""Registry der v1-Bausteine für interaktive Boards.

Jeder Baustein liefert:
  * id            — stabile Kennung (Frontend ↔ Backend)
  * label         — UI-Label (Deutsch)
  * category      — Kategorie für die Library-Filterung
  * size_weight   — Layout-Budget pro Seite (1–3)
  * help_text     — kurzer Hinweis für die Lehrkraft
  * content_schema — Pydantic-Modell für Lehrer-Inhalte
  * render        — Funktion (content, theme) → {html, css, js, used_libraries}
  * default_content — Beispiel-Defaults für „neu hinzugefügt"
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Type

from pydantic import BaseModel

from .themes import Theme
from .blocks_universal import (
    AufdeckkarteContent,
    LueckentextContent,
    MultipleChoiceContent,
    ProContraContent,
    RichtigFalschContent,
    SchrittContent,
    SortierContent,
    TextkarteContent,
    WortartenContent,
    ZuordnungContent,
    render_aufdeckkarte,
    render_lueckentext,
    render_multiple_choice,
    render_pro_contra,
    render_richtig_falsch,
    render_schritt,
    render_sortier,
    render_textkarte,
    render_wortarten,
    render_zuordnung,
)
from .blocks_visual import (
    BalkenChartContent,
    LinienChartContent,
    ZahlenstrahlContent,
    render_balken_chart,
    render_linien_chart,
    render_zahlenstrahl,
)


CATEGORIES: list[dict[str, str]] = [
    {'id': 'universal', 'label': 'Universal'},
    {'id': 'sprache', 'label': 'Sprache'},
    {'id': 'diskussion', 'label': 'Diskussion'},
    {'id': 'diagramme', 'label': 'Diagramme'},
    {'id': 'mathematik', 'label': 'Mathematik'},
]


RenderFn = Callable[[Any, Theme], dict[str, Any]]


@dataclass(frozen=True)
class BlockDefinition:
    id: str
    label: str
    category: str
    size_weight: int
    help_text: str
    content_schema: Type[BaseModel]
    render: RenderFn
    default_content: dict[str, Any]

    def to_public_dict(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'label': self.label,
            'category': self.category,
            'size_weight': self.size_weight,
            'help_text': self.help_text,
            'content_schema': self.content_schema.model_json_schema(),
            'default_content': dict(self.default_content),
        }


BLOCKS: list[BlockDefinition] = [
    BlockDefinition(
        id='textkarte',
        label='Textkarte',
        category='universal',
        size_weight=2,
        help_text='Titel + kurzer Inhalt; optional ein Merksatz, der per Tap aufgedeckt wird.',
        content_schema=TextkarteContent,
        render=render_textkarte,
        default_content={
            'title': 'Neue Textkarte',
            'body': 'Kurzer Erklärtext oder Arbeitsauftrag.',
            'merksatz': '',
        },
    ),
    BlockDefinition(
        id='aufdeckkarte',
        label='Aufdeckkarte',
        category='universal',
        size_weight=1,
        help_text='Vorderseite zeigt Frage/Begriff, Rückseite zeigt Antwort/Erklärung.',
        content_schema=AufdeckkarteContent,
        render=render_aufdeckkarte,
        default_content={
            'front': 'Begriff oder Frage',
            'back': 'Definition oder Antwort',
            'hint': '',
        },
    ),
    BlockDefinition(
        id='schritt',
        label='Schritt-für-Schritt',
        category='universal',
        size_weight=3,
        help_text='Nummerierte Schritte mit Weiter / Zurück / Reset — gut für Rechenwege oder Abläufe.',
        content_schema=SchrittContent,
        render=render_schritt,
        default_content={
            'title': 'Ablauf',
            'steps': [
                {'title': 'Schritt 1', 'body': 'Beschreibung des ersten Schritts.'},
                {'title': 'Schritt 2', 'body': 'Beschreibung des zweiten Schritts.'},
                {'title': 'Schritt 3', 'body': 'Beschreibung des dritten Schritts.'},
            ],
        },
    ),
    BlockDefinition(
        id='multiple_choice',
        label='Multiple Choice',
        category='universal',
        size_weight=2,
        help_text='Eine Frage, 2–4 Antworten — eine korrekte Antwort wird beim Tap markiert.',
        content_schema=MultipleChoiceContent,
        render=render_multiple_choice,
        default_content={
            'question': 'Welche Aussage stimmt?',
            'options': [
                {'text': 'Antwort A', 'correct': True},
                {'text': 'Antwort B', 'correct': False},
                {'text': 'Antwort C', 'correct': False},
            ],
            'explanation': '',
        },
    ),
    BlockDefinition(
        id='richtig_falsch',
        label='Richtig / Falsch',
        category='universal',
        size_weight=2,
        help_text='Mehrere Aussagen mit jeweils einem Richtig- und einem Falsch-Button.',
        content_schema=RichtigFalschContent,
        render=render_richtig_falsch,
        default_content={
            'title': 'Richtig oder falsch?',
            'statements': [
                {'text': 'Diese Aussage ist richtig.', 'correct': True},
                {'text': 'Diese Aussage ist falsch.', 'correct': False},
            ],
        },
    ),
    BlockDefinition(
        id='sortier',
        label='Sortieraufgabe',
        category='universal',
        size_weight=2,
        help_text='Karten in die richtige Reihenfolge bringen (Tap-Tap zum Tauschen).',
        content_schema=SortierContent,
        render=render_sortier,
        default_content={
            'title': 'Bringe in die richtige Reihenfolge',
            'items': ['Erstens', 'Zweitens', 'Drittens', 'Viertens'],
        },
    ),
    BlockDefinition(
        id='zuordnung',
        label='Zuordnungsspiel',
        category='universal',
        size_weight=3,
        help_text='Begriffe und Definitionen einander zuordnen (Tap links, dann Tap rechts).',
        content_schema=ZuordnungContent,
        render=render_zuordnung,
        default_content={
            'title': 'Ordne richtig zu',
            'pairs': [
                {'left': 'Begriff A', 'right': 'Bedeutung A'},
                {'left': 'Begriff B', 'right': 'Bedeutung B'},
                {'left': 'Begriff C', 'right': 'Bedeutung C'},
            ],
        },
    ),
    BlockDefinition(
        id='lueckentext',
        label='Lückentext',
        category='sprache',
        size_weight=3,
        help_text='Text mit Lücken; Wortkarten werden per Tap der passenden Lücke zugewiesen.',
        content_schema=LueckentextContent,
        render=render_lueckentext,
        default_content={
            'title': 'Setze die Wörter passend ein',
            'sentences': [
                {'text': 'Die ___ ist ein Säugetier.', 'answer': 'Katze'},
                {'text': 'Im Winter fällt oft ___.', 'answer': 'Schnee'},
            ],
            'extra_words': ['Hund'],
        },
    ),
    BlockDefinition(
        id='wortarten',
        label='Wortarten markieren',
        category='sprache',
        size_weight=3,
        help_text='Schüler tippen Wörter an und ordnen ihnen Nomen / Verb / Adjektiv zu.',
        content_schema=WortartenContent,
        render=render_wortarten,
        default_content={
            'title': 'Markiere die Wortarten',
            'sentence': 'Der kleine Hund läuft schnell durch den grünen Park.',
            'solution': {
                'Der': 'sonstiges',
                'kleine': 'adjektiv',
                'Hund': 'nomen',
                'läuft': 'verb',
                'schnell': 'adjektiv',
                'durch': 'sonstiges',
                'den': 'sonstiges',
                'grünen': 'adjektiv',
                'Park': 'nomen',
            },
        },
    ),
    BlockDefinition(
        id='pro_contra',
        label='Pro / Contra',
        category='diskussion',
        size_weight=3,
        help_text='Argumente in Pro- und Contra-Spalten einordnen — Tap-zu-Spalte.',
        content_schema=ProContraContent,
        render=render_pro_contra,
        default_content={
            'title': 'Pro und Contra',
            'arguments': [
                {'text': 'Argument 1', 'side': 'pro'},
                {'text': 'Argument 2', 'side': 'contra'},
                {'text': 'Argument 3', 'side': 'pro'},
                {'text': 'Argument 4', 'side': 'contra'},
            ],
        },
    ),
    BlockDefinition(
        id='balken_chart',
        label='Balkendiagramm',
        category='diagramme',
        size_weight=3,
        help_text='Lehrer trägt Werte ein; Chart.js zeichnet ein Balkendiagramm mit Touch-Tooltip.',
        content_schema=BalkenChartContent,
        render=render_balken_chart,
        default_content={
            'title': 'Verteilung',
            'x_label': 'Kategorie',
            'y_label': 'Wert',
            'entries': [
                {'label': 'Mo', 'value': 4},
                {'label': 'Di', 'value': 7},
                {'label': 'Mi', 'value': 5},
                {'label': 'Do', 'value': 9},
                {'label': 'Fr', 'value': 3},
            ],
        },
    ),
    BlockDefinition(
        id='linien_chart',
        label='Liniendiagramm',
        category='diagramme',
        size_weight=3,
        help_text='Werteverlauf — geeignet für Temperatur, Wachstum, Geschwindigkeit.',
        content_schema=LinienChartContent,
        render=render_linien_chart,
        default_content={
            'title': 'Verlauf',
            'x_label': 'Zeit',
            'y_label': 'Wert',
            'entries': [
                {'label': 'Mo', 'value': 12},
                {'label': 'Di', 'value': 14},
                {'label': 'Mi', 'value': 16},
                {'label': 'Do', 'value': 13},
                {'label': 'Fr', 'value': 18},
            ],
        },
    ),
    BlockDefinition(
        id='zahlenstrahl',
        label='Zahlenstrahl',
        category='mathematik',
        size_weight=3,
        help_text='Slider auf einem Zahlenstrahl — gut für Schätzaufgaben oder Größenvergleich.',
        content_schema=ZahlenstrahlContent,
        render=render_zahlenstrahl,
        default_content={
            'title': 'Wo liegt die Zahl?',
            'min': 0,
            'max': 100,
            'step': 1,
            'target': 42,
            'show_target': False,
            'markers': [0, 25, 50, 75, 100],
        },
    ),
]

BLOCK_BY_ID: dict[str, BlockDefinition] = {b.id: b for b in BLOCKS}


def public_block_registry() -> list[dict[str, Any]]:
    return [b.to_public_dict() for b in BLOCKS]
