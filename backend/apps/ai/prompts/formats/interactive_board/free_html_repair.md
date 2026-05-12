# Auftrag: Automatische Reparatur — Free-HTML5 Board (Server-Validierung)

Die **letzte KI-Fassung** hat die **serverseitige Prüfung** nicht bestanden. Deine Aufgabe: **nur** die genannten Mängel beheben — mit **minimalen Änderungen** an HTML, CSS und JavaScript. Didaktik, Layout-Idee und Touch-Konzept bleiben erhalten, soweit sie nicht mit den Regeln kollidieren.

Fehler, die mit **`[Visuell]`** beginnen, stammen aus einer **Headless-Layoutprüfung** (Überlappungen von Bedienelementen, Elemente außerhalb der **1280×720**-Bühne, sichtbare Skriptfehler-Overlays, harte Konsolen-/Lade-Fehler). Behebe sie durch Layout- und CSS-Anpassungen, nicht durch neue Features.

Einträge mit **`[Touch]`** kommen vom **Touch-Audit** (Smartboard/Tablet — z. B. zu kleine Ziele). Nur nötige CSS-/HTML-Anpassungen: größere Klick-/Touchflächen, sinnvolle Abstände, **Pointer-Events** statt reiner Mauspflicht; keine inhaltliche Neuerfindung.

**Design-Bühne:** Unverändert **1280×720 px** in `#board-root`; `.free-board` füllt **100 %** Höhe/Breite mit `box-sizing:border-box` (wie bei Erstgenerierung und Revision).

**Nicht verhandelbar:** Ergebnis muss **vollständig touch-tauglich** bleiben (Smartboard) — Mindestgrößen, kein Hover-only für Pflichtaktionen, keine Maus-Sonderpflicht (`dblclick`, `contextmenu`).

---

## Validierungsfehler (beheben — alle)

{{ validation_errors }}

(Reparatur-Lauf **{{ repair_attempt }}** von maximal **{{ repair_attempt_max }}**.)

---

## Kontext (Kurz, nicht neu erfinden)

{{ context_hint }}

---

## Aktueller Code (nach letztem Sanitizing — bitte korrigieren)

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

## Verfügbare Sandbox-Ressourcen (NUR diese)

### Libraries
{{ libraries_summary }}

### Assets
{{ assets_summary }}

### Datasets
{{ datasets_summary }}

> `fetch` ist gesperrt. Datasets: `var data = (window.BOARD_DATASETS||{})['<id>']`.

---

## Was du tun musst

1. **Jeden** aufgeführten Validierungsfehler adressieren (verbotene JS-APIs entfernen oder ersetzen, HTML/CSS-Regeln einhalten).
2. **Keine** neuen Features, kein inhaltlicher Umbau — nur **Reparatur + konsistente Anpassungen**.
3. **Ausgabe:** **`revision_kind`: `"surgical"`** bevorzugt: **`surgical_edits`** mit `target` (`html`|`css`|`javascript`), exaktem `old_text` aus dem Code oben und `new_text`. Dann dürfen `html`/`css`/`javascript` leer sein. Oder **`revision_kind`: `"full"`** mit **kompletten** neuen `html`, `css`, `javascript` (bei größeren Eingriffen).
4. JSON enthält immer **`revision_kind`** plus dieselben Metafelder wie die Erstgenerierung: `title`, `description`, `teacher_notes`, `usage_instructions`, `warnings`, `used_libraries`, `used_assets`, `used_datasets`.
5. **Bühne 1280×720:** keine `vh`/`vw`/`dvh` auf Haupt-UI; kein Überstehen/abgeschnittene Pflicht-Buttons; interner Scroll nur kontrolliert — wie in `free_html_generation.md`.

### Qualitäts- und Sicherheitsregeln (wie Generation)

- Ein äußeres **`<div class="free-board …">`**; keine `<script>`-Tags im HTML, keine `on*=` Inline-Handler, keine `<form>`/`<iframe>`/`<object>`/`<embed>`, kein `javascript:` in Links.
- JS: **IIFE**, `'use strict';`, äußeres **`try/catch`**. Keine `fetch`, `XMLHttpRequest`, `WebSocket`, Speicher-APIs, `eval`/`Function`, `import()`, Navigation/Alerts, `Worker`, `top`/`parent`, usw. (vollständige Liste wie in der Erstgenerierung).
- Touch: aktive Ziele **≥ 44×44 px**, Abstände zwischen tappbaren Elementen **≥ 8 px** (lieber ≥ 12 px).
- **Phaser:** Enthält der Code **`Phaser.`** oder **`phaser`** in `used_libraries`, halte dich an die **Phaser-3-Lehrer-Regeln** (gleicher Block wie bei Erstgenerierung) — insbesondere Graphics/Geom **Phaser 3**, ein `Game`-`parent` im DOM, keine Phaser-4-Snippets.

{{ phaser3_teacher_rules }}

---

## Antwort-JSON (Pflicht)

**Pflicht:** `title`, `html`, `css`, `javascript`, **`revision_kind`** (`full` oder `surgical`). Bei **`surgical`**: `surgical_edits` (Liste); bei **`full`**: vollständige Code-Strings.

```json
{
  "revision_kind": "full",
  "title": "…",
  "description": "…",
  "html": "…",
  "css": "…",
  "javascript": "…",
  "teacher_notes": "Kurz: welche Validierungsmängel behoben wurden.",
  "usage_instructions": [],
  "warnings": [],
  "used_libraries": [],
  "used_assets": [],
  "used_datasets": []
}
```

Kompakte Variante bei **`surgical`** (Beispiel): `"revision_kind":"surgical"`, `"html":"", "css":"", "javascript":"", `"surgical_edits":[{"target":"javascript","old_text":"fetch(","new_text":"/* entfernt */"}]` — `old_text` muss im jeweiligen String **genau einmal** vorkommen.

Antworte **ausschließlich** mit JSON, ohne Markdown-Code-Fences.
