# Goldenes Beispiel: Stromkreis-Simulation Sek I

## Ziel
Schüler:innen variieren Spannung/Widerstand und beobachten den Strom (I=U/R).

## Visuelle Identität
- Metapher: Forschungslabor (`primary #0e7490`, `accent #22d3ee`, `background #ecfeff`)
- Layout: console, density medium, age_style secondary
- Bewegung: deliberate (Zeiger-Animation der Anzeige)

## Struktur
```
.free-board
├── .board-header (Formel + Reset)
├── .main-area (Schaltbild SVG)
├── .control-zone (Slider U, Slider R)
└── .feedback-zone (große Anzeige I in mA)
```

## Touch-Regeln
- Slider min. 80×56 px, klare Skalenwerte.
- Reset-Button (alle Slider auf Defaults).
- `crypto`/`fetch` verboten — alles offline rechnen.

## Pattern-Skelett
```html
<input type="range" class="touch-target" data-prop="U" min="1" max="12" value="6" />
<input type="range" class="touch-target" data-prop="R" min="1" max="100" value="10" />
<output class="feedback-zone" id="i">600 mA</output>
```
