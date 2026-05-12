# Repair: Automatischer Visual-Polish (zweiter Durchlauf)

Du erhältst ein **bereits validiertes** interaktives Board. Dein Auftrag ist **ausschließlich** ein **visueller Feinschliff**: erkenne implizit, worum es geht (z. B. Baum, Wasserkreislauf, Zahlenstrahl — **ohne** die Didaktik umzubauen), und **verdichte die Detailqualität** von Oberfläche und Grafiken — **ohne** Layout, Position oder Ablauf zu verändern.

Modus: **visual_polish** — **kein** Bugfix, **keine** inhaltlichen Umbauten.

## Auftrag (verbindlich)

1. **Thema nur intern nutzen:** Kurz mental fassen, was die Szene zeigt — um Farben, Texturen, Stroke, Highlights **passend** zu schärfen (z. B. Rinde/Ast eines Baums, Blatt-Formen, Schatten am Stamm). **Keine** neuen Szenen oder Figuren erfinden.
2. **Details erhöhen:** z. B. feinere SVG-Strokes/Gradienten/Filter (sparsam), plastischere Schatten, klarere Typo-Hierarchie, hochwertigere Button-States (`:hover`/`:active`/`:focus-visible`), dezente Hintergrundtiefe — alles im Rahmen von **1280×720** und **Touch-tauglichen** Zielen.
3. **Layout- und Positions-Freeze:**
   - **Keine** Verschiebung bestehender Hauptblöcke: **nicht** `position`/`top`/`left`/`right`/`transform`/`translate`/`margin` von **Layout-tragenden** Containern ändern, **nicht** `flex`/`grid`-**Zuordnung** von Kindern umstellen, **nicht** Reihenfolge im DOM ändern, **nicht** Hauptflächen vergrößern/verkleinern.
   - **Erlaubt:** rein kosmetische Anpassungen **innerhalb** bestehender Boxen (z. B. `border-radius`, `box-shadow`, `background`, `color`, `font-weight`, SVG-`fill`/`stroke`/`stroke-width`, Filter auf **dieselben** Elemente).
4. **JavaScript:** **unverändert** lassen — **keine** Logik-, Event- oder Zustandsänderungen. Liefere im JSON dasselbe `javascript` wie im Eingabe-Code (**byte-gleich**), sofern du nicht **absolut** musst; der Normalfall ist **keine JS-Änderung**.
5. **Keine neuen Features:** keine zusätzlichen Buttons, Panels, Spielschritte oder Texte — außer **Mini-Labels** für Barrierefreiheit, wenn sie **ohne** Layoutshift in bestehende Controls passen.
6. **Sandbox & Libraries:** `used_libraries` / `used_assets` / `used_datasets` **unverändert** zur Ausgabe übernehmen wie im Input; keine neuen externen Ressourcen.

## Kontext / Metadaten ({{ repair_attempt }}/{{ repair_attempt_max }})

{{ context_hint }}

*(Unten stehende „Validierungsfehler“-Liste ist nur ein Platzhalter für die Prompt-Pipeline — **keine** echten Fehler zu beheben.)*

## Hinweisblock (technisch)

{{ validation_errors }}

## Aktueller Code

HTML:
```html
{{ html }}
```

CSS:
```css
{{ css }}
```

JavaScript:
```javascript
{{ javascript }}
```

## Verfügbare Ressourcen (nur zur Erinnerung — nichts Neues hinzufügen)

Libraries: {{ libraries_summary }}
Assets: {{ assets_summary }}
Datasets: {{ datasets_summary }}

Style DNA (wenn leer, am bestehenden Board ausrichten):

{{ style_dna }}

Touch-Audit / Screenshot: bei automatischem Polish meist leer — ignorieren.

{{ touch_audit }}

{{ screenshot_quality }}

## Antwort

Liefere **ausschließlich** ein einziges JSON-Objekt (Schema wie bei Generation/Repair: `revision_kind`, `html`, `css`, `javascript`, Metadaten). Bevorzuge **`revision_kind`: `"surgical"`** mit **`surgical_edits`**, wenn sich fast alles über **CSS** oder kleine SVG-Attribute lösen lässt; sonst **`full`** mit vollständigem Code — aber **immer** unter Einhaltung des **Layout-Freeze** oben.

Kein Markdown außerhalb des JSON.
