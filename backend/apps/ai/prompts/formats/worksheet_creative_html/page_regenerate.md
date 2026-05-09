# Eine Seite überarbeiten: Kreativ (HTML/CSS)

Du änderst **nur diese eine** Druckseite. **HTML und CSS**, **kein LaTeX**, **kein JavaScript**.

## Wichtig: gezielte Bearbeitung

- **Lehrer-Anweisung zuerst lesen.** Es geht um **genau** das, was dort steht — **kleine Textkorrekturen**, **eine Aufgabe anpassen**, **Reihenfolge**, **Formulierung**, **einen Abschnitt kürzen** usw.
- **Nicht** die ganze Seite „neu erfinden“ oder komplett anders layouten, **wenn** die Anweisung nur einen Teil betrifft. Alle **nicht** betroffenen Inhalte, Strukturen und **`<section class="ws-flow-item">…</section>`-Blöcke** bleiben inhaltlich und in der Gliederung **möglichst unverändert** (außer die Anweisung verlangt ausdrücklich eine umfassende Neugestaltung).
- Wenn die Anweisung **nur** einen Wortlaut ändert: **nur** diese Stelle anpassen, Rest **1:1** beibehalten.
- Wenn die Anweisung **„Seite neu“**, **„alles anders“** oder vergleichbares verlangt: darfst du die Seite **vollständig** neu aufbauen, aber Weisungen weiterhin **schüler:innentauglich** und **A4-treu** (unter `.ws-creative-page-inner` weiterhin direkte Kinder **`section.ws-flow-item`** für jeden Aufgaben-/Inhaltsblock).
- **A4:** Inhalt muss auf **eine** Seite passen. Passt der geforderte Inhalt nicht: **kürze** priorisiert (ohne Wesentliches zu verlieren) oder **vereinfache** das Layout — **kein** Überlaufen.
- **Lesbarkeit:** **Keine** helle Schrift auf hellem oder pastelligem Hintergrund; bei farbigen Kästen dunkle Lesetextfarbe verwenden — wie im Generierungs-Prompt beschrieben.
- **Scrollbars:** **Niemals** Scrollbalken innerhalb der Seitenfläche — keine `overflow: auto|scroll`/`overflow-*: auto|scroll` und keine festen Höhen-Kästen, die eigenes Scrollen erzwingen; Inhalt ohne inneres Scroll auskommen lassen.

## Einheitliches Design mit den übrigen Seiten

- Diese Seite ist Teil **eines** Arbeitsblatts; **Typografie, Farben, Abstände, Kastenstile und Tabellenmuster** sollen mit den **anderen Seiten** **zusammenpassen** — **nicht** ein isoliertes neues „Theme“ erfinden.
- Nutze die **Kurzüberblick-Zeilen** der anderen Seiten und die **bestehende `page_css`** dieser Seite: bei **kleinen** inhaltlichen Änderungen **`page_css` unverändert lassen**, wenn möglich; bei Layout-Anpassungen nur so viel ändern, dass es **weiterhin** zum Rest des Hefts passt.
- **Abweichen** nur, wenn die **Lehrer-Anweisung** ausdrücklich ein abweichendes Layout für genau diese Seite verlangt **oder** die Anweisung klar erkennen lässt, dass diese Seite **bewusst** anders gestaltet sein soll (z. B. separates Deckblatt, Lösungsseite im Reduktionsstil).

## Meta

```json
{{WORKSHEET_META_JSON}}
```

- Feld **`show_sheet_header`**: wenn **`false`**, zeigt die App **keinen** festen Kopf über diesem HTML — **keinen** kopflosen Auftritt schaffen (eigener Titel/Meta bereits im bestehenden `html` oder sinnvoll ergänzt). Wenn **`true`**, gilt die Normalvariante wie bei der ersten Generierung.
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
- **`page_css`**: nur Selektoren unter `.ws-creative-page-inner`; unverändert lassen, wenn die Anweisung kein Layout/CSS betrifft. Wenn du CSS anpasst: Stil **weiterhin** mit den anderen Seiten des Hefts abstimmen (Abschnitt „Einheitliches Design mit den übrigen Seiten“) — kein neues isoliertes Theme.

Keine `$…$`, kein KaTeX, keine `<script>`.
