# Repair: Vereinfachen

Modus: **simplify** — mache Bedienung und Lesbarkeit **innerhalb der bestehenden Struktur** klarer (Texte prägnanter wo sinnvoll, überflüssige Animationen **nur** wenn sie ablenken, UI-Redundanzen reduzieren). **Dieser Modus rechtfertigt keinen Umfangsverlust.**

## Schutzregel

- **Keine Folien/Slides, Levels oder Szenen streichen** und **keine** Aufgaben oder Hauptinhalte entfernen, **es sei denn**, der Lehrkraft-Hinweis verlangt das **ausdrücklich** (z. B. „weniger Folien“, „Level 4–6 weg“). Ohne solche Anweisung bleibt **die gleiche Menge** an Bildschirmen/Schritten erhalten; du straffst nur Darstellung und Code.

Ziel (ohne Lehrkraft-Anweisung zum Weglassen): Lehrkraft kann das Board in unter 30 s einleiten, Schüler:innen erkennen sofort, was
zu tun ist. Style DNA bleibt erhalten.

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
