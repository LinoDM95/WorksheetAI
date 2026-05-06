# Repair: Security-Fix

Modus: **security_fix** — entferne **alle** verbotenen APIs (`fetch`, `eval`, `localStorage`,
`document.cookie`, `window.parent`, `iframe`, externe URLs etc.). Funktionalität soweit
möglich erhalten. Bei Konflikt zwischen Funktion und Sicherheit hat Sicherheit Vorrang.

## Validierungsfehler ({{ repair_attempt }}/{{ repair_attempt_max }})

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

Liefere ein einziges JSON-Objekt (gleiche Felder wie Generation).
