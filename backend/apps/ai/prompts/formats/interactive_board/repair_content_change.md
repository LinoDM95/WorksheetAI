# Repair: Inhalt ändern

Modus: **content_change** — ändere die fachlichen Inhalte gemäß Lehrkraft-Hinweis im
Zusatzkontext. **Fachliche Korrektheit hat Priorität.** Layout/Design bleiben gleich,
außer das neue Inhaltsvolumen verlangt eine Anpassung.

## Lehrkraft-Hinweis ({{ repair_attempt }}/{{ repair_attempt_max }})

{{ context_hint }}

## Aktuelle Validierungsfehler

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

## Style DNA (beibehalten)

{{ style_dna }}

Liefere ein einziges JSON-Objekt (gleiche Felder wie Generation; Pflicht **revision_kind**, bei kleinen Änderungen bevorzugt **surgical** + **surgical_edits**).
