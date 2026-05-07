# Eine Seite überarbeiten: Kreativ (HTML/CSS)

Du änderst **nur diese eine** Druckseite. **HTML und CSS**, **kein LaTeX**, **kein JavaScript**.

## Wichtig: gezielte Bearbeitung

- **Lehrer-Anweisung zuerst lesen.** Es geht um **genau** das, was dort steht — **kleine Textkorrekturen**, **eine Aufgabe anpassen**, **Reihenfolge**, **Formulierung**, **einen Abschnitt kürzen** usw.
- **Nicht** die ganze Seite „neu erfinden“ oder komplett anders layouten, **wenn** die Anweisung nur einen Teil betrifft. Alle **nicht** betroffenen Inhalte, Strukturen und **`<section class="ws-flow-item">…</section>`-Blöcke** bleiben inhaltlich und in der Gliederung **möglichst unverändert** (außer die Anweisung verlangt ausdrücklich eine umfassende Neugestaltung).
- Wenn die Anweisung **nur** einen Wortlaut ändert: **nur** diese Stelle anpassen, Rest **1:1** beibehalten.
- Wenn die Anweisung **„Seite neu“**, **„alles anders“** oder vergleichbares verlangt: darfst du die Seite **vollständig** neu aufbauen, aber Weisungen weiterhin **schüler:innentauglich** und **A4-treu** (unter `.ws-creative-page-inner` weiterhin direkte Kinder **`section.ws-flow-item`** für jeden Aufgaben-/Inhaltsblock).
- **A4:** Inhalt muss auf **eine** Seite passen. Passt der geforderte Inhalt nicht: **kürze** priorisiert (ohne Wesentliches zu verlieren) oder **vereinfache** das Layout — **kein** Überlaufen.

## Meta

```json
{{WORKSHEET_META_JSON}}
```

- Seite **{{PAGE_INDEX}}** von **{{PAGE_TOTAL}}** (0-basierter Index: {{PAGE_INDEX}}).
- Kurzüberblick andere Seiten:
{{OTHER_PAGES_SUMMARY}}

## Aktuelle Seite (JSON)

```json
{{CURRENT_PAGE_JSON}}
```

## Seiten-Setup

```json
{{PAGE_SETUP_JSON}}
```

## Lehrer-Anweisung

{{TEACHER_INSTRUCTION}}

## Ausgabe

Antworte **nur** mit JSON:

- **`page_label`**: optional angepasst (nur falls sinnvoll).
- **`html`**: Fragment mit Wurzel **`<div class="ws-creative-page-inner">…</div>`**; direkte Kinder weiterhin **`section.ws-flow-item`** pro Block (sofern schon in der Vorlage vorhanden — **gleiche Anzahl** beibehalten, wenn die Anweisung nichts anderes verlangt).
- **`page_css`**: nur Selektoren unter `.ws-creative-page-inner`; unverändert lassen, wenn die Anweisung kein Layout/CSS betrifft.

Keine `$…$`, kein KaTeX, keine `<script>`.
