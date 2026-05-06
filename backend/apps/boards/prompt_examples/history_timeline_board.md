# Goldenes Beispiel: Geschichte-Zeitleiste mit Hotspots

## Ziel
Sek I navigiert eine schematische Zeitleiste (z. B. Kalter Krieg).

## Visuelle Identität
- Metapher: Historischer Atlas (`primary #1f2937`, `accent #b45309`, `background #f5e9d3`)
- Layout: atlas_panel, density medium, age_style secondary
- Schrift: serif_editorial für Headlines, system_clean für Fließtext

## Struktur
```
.free-board
├── .board-header (Epoche + Datum-Slider)
├── .main-area (Karte/Zeitleiste links, Detailpanel rechts)
├── .control-zone (Slider, Zoom, Reset)
└── .feedback-zone (Detail-Panel der Hotspots)
```

## Touch-Regeln
- Hotspots min. 56×56 px.
- Slider-Track mit Pointer-Events; Daumengriff min. 56 px.
- Reset stellt ursprüngliches Datum wieder her.

## Karten-Hinweis (Pflicht)
Wenn keine echten GeoJSON-Daten vorliegen → schematisch zeichnen und Hinweis
„vereinfachte Darstellung" sichtbar einbauen.

## Pattern-Skelett
```html
<input type="range" class="touch-target" min="1945" max="1991" value="1961" />
<button class="hotspot touch-target" data-key="berlin-mauer">Berlin (1961)</button>
<aside class="feedback-zone" hidden>…</aside>
```
