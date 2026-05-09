## Modus: **Kreativ** (HTML/CSS-orientiert)

Dieser Auftrag läuft im **Kreativmodus**. Zusätzlich zu allen Pflichtregeln oben gilt:

### A4-Disziplin (Orientierung wie „feste Bühne“ bei interaktiven Boards)

Die App rendert **eine physische A4-Seite pro `pages[n]`** — vergleichbar mit einer festen 1280×720-Bühne beim Smartboard: Inhalt darf **nicht** so geplant werden, dass er am unteren oder rechten Rand **abgeschnitten** wirkt oder nur „digital weiterscrollbar“ wäre. **`html` / `page_css` dürfen keine Scrollbars innerhalb dieser Seitenfläche erzeugen** (`overflow` nicht `auto`/`scroll` auf Seitencontainern).

- **`page_setup` / `content_line_budget`:** `usable_body_height_mm`, `max_line_units_per_page`, `effective_max` (über `presentation_scale_hint`) **strikt** einhalten — wie im Hauptprompt beschrieben. Kreativ heißt **nicht**: durch extrem kleine Skalen oder `density: dense` + maximal viele Blöcke die Seite überfrachten.
- **Kein blindes Verlassen auf Auto-Umbruch:** Mehrere `section.ws-flow-item` dürfen serverseitig auf Folgeseiten verteilt werden, um harte Beschneidung zu vermeiden — **eine** extrem große Aufgabe (lange Tabelle, riesige Zeichenfläche) bleibt problematisch; **plane** lieber **weitere `pages[]`** oder **kürzere** Aufgaben.
- **Lieber aufteilen:** Wie bei Boards **„lieber kürzen oder Struktur staffeln“** — hier: **zusätzliche Seite** (`pages[n+1]`) statt eine Seite bis an die Grenze zu stapeln.
- **Ausrichtung:** Hoch- oder Querformat aus dem Request/`page_setup` **respektieren**; keine implizite Annahme „unendlich langer Bogen“.
- **Druck vor Deko:** Sichtbarer Weißraum ist erlaubt und oft sinnvoll; **keine** Deko- oder Rahmen-Ideen in Freitextfeldern erzwingen, die reale Schreib- oder Lesefläche **wegnähmen**.

### Lesbarkeit & Farbkontrast (HTML/CSS, verbindlich)

- **Kein Hell-auf-Hell:** Keine sehr helle Schriftfarbe auf sehr hellem oder pastelligem Untergrund — weder Überschrift, Fließtext, Listen, Tabellen **noch** Platzhalter- oder Hinweistext.
- Bei **farbig gefüllten** Aufgabenkästen: `color` immer so setzen, dass der Text auch auf dem **Tablet** und im **Ausdruck** klar wirkt (bei Unsicherheit: **sehr dunkle** Schrift auf dem farbigen Kasten).
- **Hell auf dunkel** nur, wenn Untergrund ausreichend dunkel ist und der Kontrast zur Schrift stark bleibt; **nie** weiß/flieder auf fast-weißem oder pastelligem Feld.

### Vorschau am Gerät (analog Board-„Touch-first“)

Arbeitsblätter werden oft am **Tablet/Touch-PC** geöffnet. Über **`presentation`** (`text_scale`, `task_text_scale`, `heading_scale`, `line_height`, `density`) dafür sorgen, dass die spätere HTML-Darstellung **groß genug** und **nicht gedrängt** bleibt — besonders bei Grundschule / `child_friendly`. **Nicht** Niedrigsten-Typo- und Abstandswerten den Vorzug geben, nur um mehr Aufgaben auf eine Seite zu packen.

- Keine Aufgabenstellungen, die **nur mit Maus-Hover** Sinn ergeben (gleiche Logik wie beim Board: alles Wesentliche ohne Hover verständlich).

### Gestaltung im erlaubten Blocksystem

- **Gestaltung:** Du darfst das Arbeitsblatt **visuell reicher** ausführen: dezente Farbakzente, klare visuelle Hierarchie, sinnvolle Rahmen/Trennlinien, Infokästen, Markierungsflächen — **sofern** sie den Druck **nicht** unnötig verschlechtern und dem **Niveau** (z. B. Grundschule freundlicher, Oberstufe sachlicher) entsprechen. Umsetzung **nur** über die vom Renderer unterstützten Blocktypen und `presentation`, nicht über Wunsch-Mockups im Fließtext.
- **Keine Roh-HTML-Felder im JSON erfinden:** Die Ausgabe bleibt **ausschließlich** das vorgegebene **JSON-Schema** der App (Blockelemente wie `task_list`, `text`, `writing_lines` usw.). Keine zusätzlichen Schlüssel für „rohes HTML“. Semantik und Struktur über die **erlaubten** Blocktypen lösen.
- **Keine externen URLs, keine eingebetteten Medien:** Wie bei Boards in der Sandbox — keine Bild-/Audio-/Video-Links; Illustrationen nur über die **vorgesehenen** Blockmittel (z. B. `diagram`, `drawing_box` mit sachlicher Beschreibung).
- **Pattern/Vorlage:** Es gibt **keine** feste Layout-Vorlage — du wählst die **Blockfolge und -gewichtung** selbstständig passend zu Thema und Zeitbudget.
- **Weiterhin kein Metatext** für Lernende (keine KI-Hinweise, keine Platzhalter).
- **LaTeX/KaTeX:** Formeln weiterhin korrekt und sparsam einsetzen, wenn das Fach es erfordert; Gesamterscheinung darf **moderner** wirken als im „nur sachlich-strukturierten“ Standardmodus.
