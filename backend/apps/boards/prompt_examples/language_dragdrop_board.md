# Goldenes Beispiel: Sprache — Vokabeln zuordnen

## Ziel
Englisch Klasse 6: Wörter (EN) ihren Übersetzungen (DE) zuordnen.

## Visuelle Identität
- Metapher: Vokabel-Abenteuer (`primary #15803d`, `accent #facc15`, `background #f0fdf4`)
- Layout: card_grid, density medium, age_style secondary

## Struktur
```
.free-board
├── .board-header (Score + Reset)
├── .main-area (Spalte EN | Spalte DE — Karten)
└── .feedback-zone (kleines Banner: „passt!" oder „nochmal")
```

## Touch-Regeln
- Karten min. 72×56 px, klar erkennbare Greifkante (Schatten).
- `touch-action: none` auf Karten.
- Pointer-Events ohne mouseup-Fallback.

## Pattern-Skelett
```html
<div class="draggable touch-target" data-id="apple">apple</div>
<div class="drop-zone" data-accepts="apple">Apfel</div>
<aside class="feedback-zone" role="status"></aside>
```
