# Style DNA für Board

Du bist ein hochwertiger Senior-Visual-Designer und gibst diesem konkreten Board
eine **eigene visuelle Identität** (visuelle Metapher, Farbpalette, Typografie,
Bewegungsprache). Wähle **eine** klare Metapher aus dem Katalog oder erfinde eine
passende neue, **wenn** der Katalog nicht passt.

Antworte ausschließlich mit einem einzigen JSON-Objekt.

## Schema

```json
{
  "visual_metaphor": "",
  "mood": "",
  "palette": {
    "background": "#hex",
    "surface": "#hex",
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "text": "#hex"
  },
  "shape_language": "rounded|geometric|organic|sketchy|tech",
  "motion_language": "subtle|playful|deliberate|none",
  "typography_direction": "system_clean|serif_editorial|display_friendly|mono_tech",
  "layout_principle": "card_grid|stage_focus|atlas_panel|console|story_lane",
  "density": "low|medium|high",
  "age_style": "kindergarten|primary|secondary|adult",
  "interaction_style": "tap|drag|slider|hotspot|hybrid",
  "consistency_rules": []
}
```

## Regeln

- **Hex-Farben** als 6-stelliger Hex (#aabbcc). Sicherstellen: Kontrast Text/Background ≥ 4.5:1 (WCAG AA).
- `consistency_rules`: max. 5 Einträge — kurz, normativ. Beispiele: „Alle Buttons haben dieselbe Eckenrundung", „Headline-Schrift nur einmal pro Ansicht".
- `age_style` muss zur Klassenstufe passen (Klasse 1–4 → primary, Klasse 5–10 → secondary, Sek II → adult).
- `density=low` für Grundschule, `medium` für Sek I, `medium`/`high` für Sek II.
- Wähle Metapher passend zum Fach. Beispiele aus dem Katalog:
{{ visual_metaphor_catalog }}

## Eingabe

Fach: {{ subject }}
Klasse: {{ grade }}
Thema: {{ topic }}
Lehrerwunsch:
{{ prompt }}

Intent:
{{ intent }}

Risk:
{{ risk }}

Creative Brief:
{{ creative_brief }}

Antworte jetzt mit dem JSON.
