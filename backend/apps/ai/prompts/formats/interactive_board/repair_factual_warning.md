# Repair: Fachliche Hinweise / Vereinfachung

Modus: **factual_warning** — wenn das Board fachlich riskant ist (z. B. exakte
historische Karten, falsche Zahlen), erstelle eine **schematische Variante** und
ergänze einen sichtbaren Hinweis im Board (z. B. „Schematische Darstellung").
Vermeide falsche Genauigkeit.

## Audits & Fehler ({{ repair_attempt }}/{{ repair_attempt_max }})

{{ validation_errors }}

## Zusatzkontext

{{ context_hint }}

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

## Style DNA (beibehalten)

{{ style_dna }}

Liefere ein einziges JSON-Objekt (gleiche Felder wie Generation; Pflicht **revision_kind**, bei kleinen Änderungen bevorzugt **surgical** + **surgical_edits**).
