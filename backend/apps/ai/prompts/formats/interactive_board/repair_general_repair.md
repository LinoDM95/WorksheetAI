# Repair: Allgemeine Reparatur

Modus: **general_repair** — behebe alle gefundenen Probleme (Validierung, Touch, Layout,
Design), so dass das Board wieder valide rendert. Vorsichtige Änderungen, Style DNA
beibehalten.

## Validierungsfehler & Audit-Hinweise ({{ repair_attempt }}/{{ repair_attempt_max }})

{{ validation_errors }}

## Zusatzkontext

{{ context_hint }}

## Touch-Audit

{{ touch_audit }}

## Screenshot/Layout-Bewertung

{{ screenshot_quality }}

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

## Verfügbare Ressourcen

Libraries: {{ libraries_summary }}
Assets: {{ assets_summary }}
Datasets: {{ datasets_summary }}

Liefere ein einziges JSON-Objekt (gleiche Felder wie Generation).
