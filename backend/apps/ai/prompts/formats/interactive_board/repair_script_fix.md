# Repair: Skript-Abschluss (Laufzeit & Bibliotheken)

Du reparierst ein **bereits validiertes** interaktives Board. Der Auftrag ist **nur**, die **gemeldeten Skript-/Runtime-Probleme** zu beheben — typischerweise fehlende **`used_libraries`**-Einträge zu globals (`confetti`, `Chart`, `Matter`, …), falsch referenzierte APIs oder Aufrufe **bevor** die Bibliothek geladen ist.

Modus: **script_fix** — **keine** didaktische Neuerfindung, **kein** Layout- oder Visual-Redesign.

## Validierungsfehler / Konsole ({{ repair_attempt }}/{{ repair_attempt_max }})

{{ validation_errors }}

## Zusatzkontext

{{ context_hint }}

## Pflichtregeln

1. **`used_libraries` konsistent:** Sobald Code eine Sandbox-Library nutzt (z. B. `confetti(`, `window.confetti`, `new Chart`, `Matter.`, `interact(`, …), **muss** die passende ID in `used_libraries` stehen — oder der Aufruf wird durch sicheren Vanilla-Code ersetzt / mit `typeof … === 'function'` geschützt und nur dann ausgeführt.
2. **`confetti`:** Wenn Konfetti genutzt wird: **entweder** `confetti` in `used_libraries` **und** Aufruf nur nach sicherem Laden **oder** Aufruf nur nach Guard wie `if (typeof window.confetti === 'function') window.confetti({ … });`.
3. **Keine neuen Features:** keine zusätzlichen Spielschritte, keine neuen Buttons — nur Robustheit und Korrektheit.
4. **Layout:** keine Verschiebung der Hauptstruktur (keine neuen übergeordneten Container, keine Änderung von `flex`/`grid`-Zuweisung der Hauptbereiche). Kleinere Anpassungen nur, wenn sie **unmittelbar** nötig sind, um einen Crash zu vermeiden.
5. **Sandbox:** keine externen URLs; nur Registry-Libraries und lokale `/board-assets/`-Pfade wie bisher.

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

## Style DNA (weitgehend beibehalten)

{{ style_dna }}

## Antwort

Liefere **ausschließlich** ein einziges JSON-Objekt mit den Feldern
``revision_kind``, ``html``, ``css``, ``javascript``, ``teacher_notes``, ``usage_instructions``,
``warnings``, ``used_libraries``, ``used_assets``, ``used_datasets``,
``title``, ``description``. Optional ``surgical_edits`` wenn ``revision_kind`` = ``surgical``.
Keine Code-Fences, kein Markdown außerhalb des JSON.
