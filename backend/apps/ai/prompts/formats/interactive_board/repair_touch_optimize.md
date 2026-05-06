# Repair: Touch optimieren

Du optimierst Touch-Bedienbarkeit eines bestehenden Boards.
Modus: **touch_optimize** — fokussiere auf:
- Pointer-Events (`pointerdown`, `pointermove`, `pointerup`) statt nur `mouse*`
- Mindestens **56 px** Touchflächen (Grundschule **64 px**)
- `touch-action: none` auf Drag-Elementen
- Keine reine Hover-Bedienung — sichtbare Klick-/Tipp-Affordanzen
- Mindestabstand 16 px zwischen Bedienelementen

Verändere **kein** Inhalt und **kein** Aussehen unnötig. Style DNA bleibt erhalten.

## Audits & Fehler ({{ repair_attempt }}/{{ repair_attempt_max }})

{{ validation_errors }}

Touch-Audit:
{{ touch_audit }}

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

## Verfügbare Ressourcen

Libraries: {{ libraries_summary }}
Assets: {{ assets_summary }}
Datasets: {{ datasets_summary }}

## Antwort

Liefere **ausschließlich** ein einziges JSON-Objekt (gleiche Felder wie Generation).
