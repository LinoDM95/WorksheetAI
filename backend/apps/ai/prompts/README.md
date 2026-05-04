# KI-Prompts (`apps/ai/prompts/`)

Markdown-Vorlagen werden zur Laufzeit eingelesen; strukturierte Werte kommen aus API/Frontend und werden als JSON eingesetzt (**`prompt_loader`**).

## Ordnerstruktur

```
prompts/
├── README.md                 ← dieses Dokument
├── shared/                   ← formatübergreifend (werden je nach Funktion angehängt)
│   ├── formulierung_schule_dach.md
│   └── latex_katex_schule_reference.md
└── formats/                  ← ein Unterordner pro Ausgabeformat
    └── html_a4_worksheet/    ← MVP: mehrseitiges Arbeitsblatt, HTML/A4-Blocksystem
        ├── generation.md     ← Hauptgenerierung (früher worksheet_generation.md)
        ├── review.md         ← Qualitätsdurchgang
        └── page_regenerate.md
```

### Weitere Formate (geplant)

Neues Format anlegen:

1. Unter **`formats/`** einen Ordner anlegen, z. B. `latex_a4_worksheet` oder `flashcards_a6`.
2. Darin dieselben **Dateinamen** wie oben (`generation.md`, `review.md`, `page_regenerate.md`), sofern der Workflow passt — oder nur die Teile, die ihr wirklich braucht (dann `prompt_loader` und ggf. Provider pro Format erweitern).
3. In **`backend/.env`** setzen: `AI_PROMPT_WORKSHEET_FORMAT=<ordnername>` (Default: `html_a4_worksheet`).

**`shared/`** bleibt für Sprach-/KaTeX-Regeln, die mehrere Formate nutzen. Format-spezifische Anhänge können zusätzlich im Format-Ordner liegen und im Loader eingebunden werden.

## Platzhalter (`generation.md`)

- `{{TEACHER_CONTEXT}}` — Freitext der Lehrperson
- `{{REQUEST_JSON}}` — vollständiges Request-Objekt
- `{{PAGE_SETUP_JSON}}` — normiertes Seitenlayout
- `{{PATTERN_JSON}}` — Blueprint der Vorlage

`review.md`: `{{WORKSHEET_JSON}}` zusätzlich.  
`page_regenerate.md`: siehe Dateikopf / Platzhalter im Text.

Ersetzung: **`apps.ai.prompt_loader`**.

## Gemini-System/User-Split

Für `generation.md` müssen die Anchors **`## Kontext vom Lehrenden`** und **`## Ausgabe-JSON (Kurzüberblick)`** vorhanden bleiben, damit `GEMINI_PROMPT_SPLIT_SYSTEM_USER` funktioniert.
