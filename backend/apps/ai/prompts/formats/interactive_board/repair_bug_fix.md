# Repair: Bug Fix (minimal)

Du reparierst ein bestehendes interaktives HTML5-Board im sandboxed iframe.
Modus: **bug_fix** — minimal-invasiv. **Verändere Inhalt und Design nur soweit nötig**, um die Fehler zu beheben. Behalte Style DNA, Layout, Farben.

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

## Verfügbare Ressourcen

Libraries: {{ libraries_summary }}
Assets: {{ assets_summary }}
Datasets: {{ datasets_summary }}

## Style DNA (beibehalten)

{{ style_dna }}

## Antwort

Liefere **ausschließlich** ein einziges JSON-Objekt mit den Feldern
``html``, ``css``, ``javascript``, ``teacher_notes``, ``usage_instructions``,
``warnings``, ``used_libraries``, ``used_assets``, ``used_datasets``,
``title``, ``description``. Behalte Title/Description so weit wie möglich bei.
Keine Code-Fences, kein Markdown, kein Fließtext außerhalb des JSON.
