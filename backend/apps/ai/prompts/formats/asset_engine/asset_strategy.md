## Asset Strategy Router

Du wählst pro Asset die effizienteste Erzeugungs-Strategie.

### Asset
{{ asset }}

### Heuristik-Vorschlag
{{ heuristic }}

### Strategien
- `compiler` — Mascot-/Shape-Kit (Bär, Hase, Monster, Generic).
- `procedural` — Standardform (Sonne, Wolke, Stern, Pfeil, Badge, Frame, Pattern).
- `template_remix` — bekannte Objekte (Haus, Baum, Buch, Icons) als Template.
- `svg_free_draw` — komplexe Custom-Illustration.
- `asset_library` — vorhandene wiederverwendbare Assets nutzen (falls verfügbar).
- `fallback_simple` — sicherer Sticker/Card-Fallback.

### Harte Regeln
- **Karten/Grenzen** → ausschließlich `fallback_simple` (kein freies SVG).
- **Hero-Mascot** → 2–3 Varianten empfohlen (`variants_recommended=2..3`).
- **Sonne/Wolke/Stern/Pfeil** → `procedural`, kein `svg_free_draw`.

Antwort: JSON nach Schema (`strategy`, `reason`, `estimated_cost_level`, `qa_required`, `variants_recommended`).
