# Goldenes Beispiel: Wasserkreislauf für Klasse 3/4

## Ziel
Grundschulkinder folgen einer Tippschritt-Animation entlang des Wasserkreislaufs.

## Visuelle Identität
- Metapher: Naturpfad (`primary #166534`, `accent #84cc16`, `background #f0fdf4`)
- Layout: stage_focus, density low, age_style primary
- Schrift: display_friendly, große Headlines

## Struktur
```
.free-board
├── .board-header (Titel + großer Reset-Button)
├── .main-area (SVG-Bühne mit Wolken/Regen/Verdunstung)
└── .control-zone (große runde Tipp-Buttons: „weiter", „nochmal")
```

## Touch-Regeln (Grundschule = 64 px)
- Buttons min. 64×64 px, runde Ecken.
- Reset-Button im Header **groß**, immer sichtbar.
- **Keine** kleinen Texteingaben.

## Animations-Regeln
- Sanfte Bewegungen (`requestAnimationFrame`).
- Keine Endlos-`setInterval`-Loops.

## Pattern-Skelett
```html
<div class="free-board">
  <header class="board-header"><h1>Wasserkreislauf</h1><button class="reset-button touch-target">Zurück</button></header>
  <main class="main-area"><svg viewBox="0 0 1280 600">…</svg></main>
  <section class="control-zone">
    <button class="touch-target">Weiter</button>
    <button class="touch-target">Nochmal</button>
  </section>
</div>
```
