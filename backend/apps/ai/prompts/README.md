# Prompt-Vorlagen (`*.md`)

Diese Markdown-Dateien sind **die zentrale Textquelle** für KI-Anweisungen. Sie werden zur Laufzeit eingelesen; **strukturierte Werte** (Thema, Niveau, Freitext der Lehrkraft, …) kommen aus dem **Frontend/API** und werden als JSON in Platzhalter eingefügt.

| Datei | Verwendung |
|-------|------------|
| `worksheet_generation.md` | Hauptprompt: **mehrseitige A4-Seiten** (`pages[]`), **`presentation`** (Schrift, Dichte, Register, Begründung Zeit/Niveau) |
| `formulierung_schule_dach.md` | **Sprache & Didaktik D-A-CH:** Zielgruppen, Operatoren, inklusive Formulierung, Anforderungstiefe; wird vor dem LaTeX-Anhang eingefügt |
| `latex_katex_schule_reference.md` | **LaTeX für KaTeX im Browser**: erlaubte Umgebungen, Schulkonventionen, typische Fehler; wird beim Generieren an den Hauptprompt angehängt |

## Platzhalter

In `worksheet_generation.md`:

- `{{TEACHER_CONTEXT}}` — Freitext der Lehrperson
- `{{REQUEST_JSON}}` — vollständiges Request-Objekt (alle Formularfelder)
- `{{PAGE_SETUP_JSON}}` — normiertes Seitenlayout
- `{{PATTERN_JSON}}` — Blueprint der gewählten oder gematchten Vorlage

Ersetzung erfolgt in `apps.ai.prompt_loader`.
