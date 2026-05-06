# Goldenes Beispiel: Mathe-Brüche-Zuordnungsspiel

## Ziel
Klasse 5/6 ordnet Pizza-Bilder ihren Brüchen und Dezimalzahlen zu.

## Visuelle Identität (Style-DNA-Snapshot)
- Metapher: Mathe-Pizzeria (`primary #e8593f`, `accent #f6c560`, `background #fff8ef`)
- Layout: card_grid, density medium, age_style secondary
- Bewegung: subtle (Skalieren bei Klick, kein hektisches Bouncen)

## Struktur
```
.free-board
├── .board-header (Titel: „Pizzeria Bruchglück")
├── .main-area (3 Spalten: Pizza-Bild | Bruch | Dezimal)
├── .control-zone (Reset, „Lösung zeigen")
└── .feedback-zone (gepunktete Box)
```

## Touch-Regeln
- Karten min. 80×80 px (Klasse 5/6 → comfortable).
- Pointer-Events für Drag (`pointerdown/move/up`), `touch-action: none` auf `.draggable`.
- Reset-Button immer sichtbar.

## Pattern-Skelett
```html
<div class="free-board">
  <h1>Pizzeria Bruchglück</h1>
  <div class="main-area">
    <div class="draggable touch-target" data-id="1/2">…</div>
    <div class="drop-zone" data-accepts="1/2"></div>
  </div>
  <button class="reset-button touch-target">Zurücksetzen</button>
</div>
```

## Didaktischer Flow
1. **Einstieg**: Pizza-Bild → Bruch erkennen.
2. **Üben**: Drag-Drop mehrerer Pärchen.
3. **Sichern**: Lösung zeigen + Erklärung.
