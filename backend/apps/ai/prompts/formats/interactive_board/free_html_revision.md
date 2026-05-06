# Auftrag: Interaktives Board — Revision (Free HTML5)

Du bekommst ein bestehendes Board und einen Änderungswunsch. Liefere eine **vollständig überarbeitete Fassung** von HTML, CSS und JavaScript zurück. Es bleiben dieselben Sicherheits- und Sandbox-Regeln wie bei der Erstgenerierung gültig.

**Design-Bühne:** Der Loader verwendet eine feste Arbeitsfläche **1280×720 px** und skaliert sie **proportional als Ganzes**. Dein Inhalt liegt in **`#board-root`**; **alles Wesentliche** bleibt **innerhalb dieser Fläche** (`.free-board` füllt **100 %** mit `box-sizing: border-box`).

## Pflicht: Bühne 1280×720 — gleiche Regeln wie bei Erstgenerierung

- **Kein Entweichen:** Keine Pflicht-Steuerung, kein Pflicht-Text und kein Hauptgrafikbereich **dauerhaft über** den Rand der Bühne oder nur „irgendwo“ per Scroll außerhalb von `.free-board`.
- **`100vw`/`100vh`/`100dvh`/`100svh` auf Haupt-UI verboten**; nutze **px** oder **% von `.free-board`**. Kein zusätzliches `transform: scale` auf `.free-board`.
- **`position: fixed` sparsam**; nichts Wichtiges am Rand **abschneiden**.
- **Interner Scroll** nur in **einem** bewusst begrenzten Bereich (`max-height`, `overflow-y: auto`, `touch-action: pan-y`); **Haupt-Aktionen** möglichst **ohne Scroll** erreichbar.
- **Keine starken Überlappungen** bedienbarer Flächen; klares **flex/grid**-Layout.

**Nicht verhandelbar:** Die Fassung muss **weiterhin vollständig touch-tauglich** sein (Smartboard / Fingerbedienung) — auch wenn der Änderungswunsch nichts davon erwähnt.

---

## Aktueller Stand

### HTML
```html
{{ html }}
```

### CSS
```css
{{ css }}
```

### JavaScript
```javascript
{{ javascript }}
```

---

## Änderungswunsch der Lehrkraft

{{ prompt }}

---

## Verfügbare Sandbox-Ressourcen (NUR diese)

### Libraries
{{ libraries_summary }}

**Hinweis:** Nur optionale Library-IDs in `used_libraries` eintragen, die im neuen JavaScript **tatsächlich** genutzt werden (`chartjs` ↔ `Chart`/`new Chart`; **`interactjs`** ↔ **`interact(`**; **`matterjs`** ↔ **`Matter.`**; **`gsap`** ↔ **`gsap.`**; **`confetti`** ↔ **`confetti(`**; **`howler`** ↔ **`new Howl`**; **`konva`** ↔ **`Konva.`**/`new Konva`).

### Assets
{{ assets_summary }}

### Datasets
{{ datasets_summary }}

> Externe URLs sind nicht erlaubt. Datasets sind als globales `BOARD_DATASETS["<id>"]` verfügbar (vom Loader injiziert).
>
> **Karten:** Nur über `used_datasets` und `BOARD_DATASETS` (GeoJSON oder schematische JSON-Karten) — keine Basemap-SVGs aus `/board-assets/`.

---

## Pflicht: Touch / Smartboard (immer)

- **Fingerbedienung:** Alle aktiven Elemente **mindestens 44×44 px** (oft 48×48 px), **Abstand** zwischen Zielen **≥ 8 px** (lieber ≥ 12 px).
- **Nicht nur Hover:** Keine Pflichtinformation oder -steuerung ausschließlich über `:hover` / Mouseover-Tooltips — alles Wesentliche per **Tap** oder dauerhaft sichtbar.
- **Kein `dblclick` / `contextmenu`** für Pflichtaktionen. **Drag** nur mit großen Griffen oder durch **Tap-Tap**-Muster ersetzen.
- **Slider:** Große Thumbs (CSS-Pseudoelemente) **oder** **+ / −**-Buttons mit vollen Touch-Zielen.
- **Karten-Hotspots:** Keine mikroskopischen Klickflächen.

---

## Qualitätsregeln (Pflicht)

- Liefere **die komplette neue Fassung** (kein Diff, keine Patch-Notes).
- Lasse das, was funktioniert, intakt — refactor nur, was der Wunsch verlangt oder offensichtlich fehlerhaft ist.
- Wickle alles in **ein** Element **`<div class="free-board ...">`** mit **`width:100%; height:100%; min-height:100%; max-height:100%; box-sizing:border-box;`** — exakt die **1280×720**-Bühne füllen. **`100vh`/`100dvh` auf der Hauptfläche vermeiden** (Prozent/`100%` zu `.free-board` bevorzugen). Keine eigenen Wrapper `#wa-*`/`#board-root`.
- Verbote unverändert: kein `<script>` im HTML, keine `on*=` Inline-Handler, keine `<form>`/`<iframe>`/`<object>`/`<embed>`, kein `javascript:`-href.
- JS in IIFE mit `'use strict';` + `try/catch`. Keine verbotenen APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `localStorage`/`sessionStorage`/`indexedDB`, `document.cookie`, `eval`, `new Function`, `Function('…')`, `import()`, `alert/prompt/confirm`, `location.*`, `document.write`, `navigator.geolocation`, `navigator.clipboard`, `Notification`, `serviceWorker`, `Worker`, `top.`, `parent.`).
- Defensive DOM-Zugriffe: alle `getElementById/querySelector` Ergebnisse vor Nutzung prüfen.
- Optional: **`chartjs` → `Chart`**, wenn in `used_libraries`. **`interactjs`/`matterjs`/`gsap`/`confetti`/`howler`/`konva`/`leaflet`/`turf`/`topojson`** analog — immer ID setzen, sobald das globale API im Code vorkommt. Sonst **d3**/Vanilla wie in der Haupt-Prompt-Anleitung.
- Werte aus `<input type="range">` mit `parseInt/parseFloat` lesen und auf Range klemmen.
- Kein `setInterval` ohne `clearInterval`. Kein endloser `requestAnimationFrame` ohne Abbruchbedingung.
- **Touch / Smartboard:** Regeln im Abschnitt „Pflicht: Touch / Smartboard“ vollständig erfüllen — nicht nur Hover, Mindestgrößen für alle Bedienelemente.

---

## Antwort-JSON (Pflicht)

```json
{
  "title": "Titel ggf. anpassen",
  "description": "1–2 Sätze",
  "html": "neue komplette HTML-Fassung",
  "css": "neue komplette CSS-Fassung",
  "javascript": "neue komplette JS-Fassung",
  "teacher_notes": "kurz, was geändert wurde + Hinweise",
  "usage_instructions": ["Schritt 1", "…"],
  "warnings": ["…"],
  "used_libraries": ["d3", "roughjs", "chartjs"],
  "used_assets": [],
  "used_datasets": []
}
```

Antworte **ausschließlich** mit JSON, ohne Markdown-Code-Fences drumherum.
