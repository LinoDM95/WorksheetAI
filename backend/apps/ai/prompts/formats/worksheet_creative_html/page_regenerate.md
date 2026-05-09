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

- Diese Seite ist Teil **eines** Arbeitsblatts; **Typografie, Farben, Abstände, Kastenstile, Illustrationen und Tabellenmuster** sollen mit den **anderen Seiten** **dieselbe visuelle Handschrift** haben — **nicht** ein isoliertes neues „Theme“ oder optisch höherwertigere Grafiken „nur hier“ erfinden.
- **Illustrationen** (Socken, Symbole, kleine SVGs, Figuren): **Linienstärke**, **Kanten (eckig/weich)**, **Flächenfüllung vs. nur Outline**, **Detailgrad** — an den **Schwesterseiten** orientieren (siehe Abschnitt „Stil-Referenz“ unten). **Keine** Seite soll wie aus einem anderen Clip-Art-Set wirken.
- Nutze den **Kurzüberblick**, die **`page_css` der Schwesterseiten** im Referenzblock und die **bestehende `page_css`** dieser Seite: bei **kleinen** inhaltlichen Änderungen **`page_css` möglichst unverändert lassen**; wenn du CSS anpasst: **gleiche Variablen/Selektoren-Logik** wie auf den anderen Seiten.
- Wenn dieselbe Lehrer-Anweisung mehrere Seiten betrifft (überarbeitete Serie): **gleiche „Qualitäts-Stufe“** halten — **nicht** auf einer Seite plötzlich mehr Schatten, mehr 3D oder mehr Dekoration als auf den anderen, **außer** die Anweisung verlangt genau einen solchen Kontrast für eine bestimmte Seite.
- **Abweichen** nur, wenn die **Lehrer-Anweisung** ausdrücklich ein abweichendes Layout **für diese Seite** verlangt **oder** ausdrücklich einen **andersartigen visuellen Stil** fordert.

## Tiefe Stil-Referenz: Schwesterseiten (`page_css` + HTML-Auszüge)

Der folgende Block ist **verbindlich zum Abgleich** von CSS und Illustrations-/Layout-Sprache. **HTML der Schwesterseiten nicht** wortgleich kopieren — nur den **gemeinsamen Gestalt-Stil** ableiten und auf **diese** Seite übertragen:

{{OTHER_PAGES_STYLE_REFERENCE}}

## Meta

```json
{{WORKSHEET_META_JSON}}
```

- Feld **`show_sheet_header`**: wenn **`false`**, zeigt die App **keinen** festen Kopf über diesem HTML — **keinen** kopflosen Auftritt schaffen (eigener Titel/Meta bereits im bestehenden `html` oder sinnvoll ergänzt). Wenn **`true`**, gilt die Normalvariante wie bei der ersten Generierung.
- Seite **{{PAGE_INDEX}}** von **{{PAGE_TOTAL}}** (0-basierter Index: {{PAGE_INDEX}}) = **Fokusseite** der Bearbeitung.
- Kurzüberblick andere Seiten:
{{OTHER_PAGES_SUMMARY}}

## Gesamtdokument (alle Seiten, Indizes für Strukturänderungen)

{{DOCUMENT_OUTLINE}}

### Struktur **nur** auf ausdrückliche Lehrer-Anweisung

- **`document_operations`**: standardmäßig **`[]`** (leer).
- Fülle Operationen **nur**, wenn die Lehrer-Anweisung **explizit** verlangt:
  - eine **weitere Druckseite** anzulegen / einzufügen, **oder**
  - eine **`section.ws-flow-item`** (ein Aufgaben-/Inhaltsblock) **zwischen Seiten zu verschieben**.
- **Nicht** aus eigenem Ermessen Seiten einfügen oder Sektionen verschieben — nie „proaktiv“ aufräumen.
- **`replace_focus_page`**: `false`, wenn die Anweisung **ausschließlich** strukturelle Änderungen am Dokument verlangt (neue Seite / Verschieben) **und** die **Fokusseite** inhaltlich **unverändert** bleiben soll. In dem Fall `html` leer lassen oder unkritischen Platzhalter, `page_css`/`page_label` dürfen leer bzw. unverändert gedacht werden — der Server **ignoriert** die Fokus-Felder bei `false`.
- **`replace_focus_page`**: `true`, wenn die Fokusseite **inhaltlich** überarbeitet werden soll (wie bisher) — mit oder ohne zusätzliche `document_operations`.
- Reihenfolge: `document_operations` werden **zuerst** angewendet (in der gegebenen Reihenfolge), **danach** ggf. die Fokusseite ersetzt (`replace_focus_page`).

#### Operation `insert_page_after`

- `op`: `"insert_page_after"`
- `after_index`: ganze Zahl ≥ **-1**; neue Seite steckt bei Index `after_index + 1` (**-1** = vor der ersten Seite).
- `new_page`: Objekt mit **`page_label`**, **`html`** (Wurzel `<div class="ws-creative-page-inner">…</div>`, direkte Kinder `section.ws-flow-item`), **`page_css`** (nur unter `.ws-creative-page-inner`).

#### Operation `move_flow_item`

- `op`: `"move_flow_item"`
- `from_page`, `from_section_index` (0-basiert, siehe Dokument-Übersicht), `to_page`, `to_section_index` (Einfügen **vor** dieser Sektion; **≥** Anzahl = ans **Ende** der Zielseite).
- **Keine** leeren oder ungültigen Indizes; Ziel- und Quellseite müssen existieren.


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

- **`replace_focus_page`**: boolean (siehe „Struktur nur auf ausdrückliche Lehrer-Anweisung“).
- **`document_operations`**: Array (oft `[]`).
- **`page_label`**: optional angepasst (nur falls `replace_focus_page` true und sinnvoll).
- **`html`**: Fragment mit Wurzel **`<div class="ws-creative-page-inner">…</div>`** … (bei `replace_focus_page` false leer lassen).
- **`page_css`**: nur Selektoren unter `.ws-creative-page-inner` … (bei rein strukturellem Job oft leer).

Keine `$…$`, kein KaTeX, keine `<script>`.
