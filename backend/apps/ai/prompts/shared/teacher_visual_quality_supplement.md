# Ergänzung: Visuelle Qualität & Barrierefreiheit (Worksheet AI)

Dieser Anhang verdichtet bewährte Praktiken (angelehnt u. a. an *Design DNA*, *Baseline UI*, *WCAG 2.2*, *Web Interface Guidelines*) für **deutschsprachige Bildung** — **ohne** eure technischen Pflichten zu ersetzen.

---

## 1. Rangfolge (verbindlich)

Die **jeweils gültigen Haupt-Prompts und Produktregeln** haben **immer Vorrang** vor diesem Abschnitt. **Nichts lockern, nicht widersprechen:**

| Kontext | Vorrang vor diesem Anhang |
|--------|---------------------------|
| Interaktives Board (freies HTML) | Sandbox: 1280×720, `.free-board`, Touch-Pflicht, erlaubte Libraries/Assets, **keine** externen URLs, **kein** verbotenes JS/API, JSON-Ausgabeformat. |
| Bausteinmodus (Slot-Füllung) | **Nur** schema-konformes JSON `content` — **kein** HTML/CSS/JS/Markdown in Strings, **keine** URLs/Medien, keine Code-Keys. |
| Baustein-Feinschliff | **Niemals** Code erzeugen; nur erlaubte Felder (Theme, Kurztexte …). |
| Arbeitsblatt A4 | Strukturdruck, **keine** Gestaltungs-Deko in schülersichtbaren Texten, `presentation` & Zeilenbudget nach Hauptprompt. |
| Style-DNA-JSON | Hex-Palette, Kontrast-Vorgaben und Schema aus `style_dna.md`. |

**Dieser Text ergänzt** gute Praxis und Präzision — er **definiert** keine neuen erlaubten Technologien oder Ausnahmen.

---

## 2. Nur wenn du HTML, CSS und/oder JavaScript lieferst

*(Bausteinmodus mit reiner JSON-Slot-Antwort: **diesen Abschnitt komplett ignorieren** und nur **Abschnitt 3** beachten.)*

### 2.1 Kohärente visuelle Identität („Design-DNA“-Denken)

- Einheitliche **Farben, Rundungen, Typo-Stufen und Bewegungsstil** über das Board; vermeide ein Nebeneinander widersprüchlicher „Design-Experimente“.
- **Style DNA** / **Creative Brief** aus der Pipeline sind **Leitplanken**, wenn vorhanden — nicht ignorieren, nur weglassen, wenn der Platz **leer** ist und der Hauptprompt das vorsieht.
- **Motion:** dezent und kurz (Orientierung **ca. 150–300 ms**); **keine** dauerhaft ablenkenden Loops. Wenn du `prefers-reduced-motion` sinnvoll berücksichtigen kannst (ohne Sandbox zu verletzen), **bevorzuge** reduzierte Bewegung.

### 2.2 Baseline UI (Anti-Slop, Smartboard-tauglich)

- **Hierarchie:** klare Lesereihenfolge (Überschrift → Aufgabe → Steuerung); nicht zu viele gleichwertige Flächen konkurrieren lassen.
- **Typografie:** auf der **1280×720**-Bühne lesbar; **kein** Mikrotext für Pflichtinformationen; ausreichender Zeilenabstand.
- **Touch:** wie im Hauptprompt — große Ziele, Abstände; **kein** hover-only für Pflichtaktionen.
- **Dekoration:** nur, wenn sie **didaktisch** oder **orientierend** hilft — kein „Tech-Deko“ um des Effekts willen. **Kurzes, lernmotivierendes Feedback** (z. B. dezentes Konfetti nach richtiger Antwort) ist **keine** bloße Ziererei, solange es den Auftrag nicht übertönt.

### 2.3 Barrierefreiheit (technische WCAG 2.2 — Kurzfassung, **keine** Zertifizierung)

- **Kontrast:** normaler Text und Bedienelemente möglichst **mindestens 4,5:1** zum Hintergrund; größerer Text mindestens **3:1** — im Einklang mit **Style-DNA-Palette**.
- **Fokus:** fokussierbare Elemente **sichtbar** fokussierbar; nicht `outline: none` ohne gleichwertigen Ersatz.
- **Semantik:** sinnvolle Überschriftenebenen; echte **Buttons**/`role` wo nötig; Beschriftungen (`label` / `aria-label`), wenn sonst der Zweck unklar ist.
- **Nicht nur Farbe:** Zustände (z. B. gewählt, richtig/falsch) **nicht allein** über Farbe unterscheiden.
- **Kein** flackerndes/stroboskopisches Muster in **hoher Frequenz**.

*Hinweis: Das ersetzt keine rechtliche oder formale Barrierfreiheitsprüfung — nur Unterrichts-taugliche Qualität.*

### 2.4 Web Interface Guidelines — Kern (ohne externe Live-URL)

- **Vorhersehbar:** Nutzer verstehen, wie es weitergeht; klare Primäraktionen.
- **Konsistenz:** gleiche Begriffe und Muster für gleiche Aktionen.
- **Fehlerfreundlichkeit:** kurze, hilfreiche Hinweise bei Fehlbedienung — ohne belehrenden Fließtext.
- **Minimalismus (visuelle Oberfläche):** so viel **Gestaltung** wie für **Klarheit und Motivation** nötig — nicht mehr **reine Deko**. **Gleichzeitig:** Das ist **kein** Aufruf, auf **passende** Technik zu verzichten — **Libraries, Szenen-Engines** und **strukturierten Code** wie im **Hauptprompt** (Qualität vor Kurzcode) sind davon **nicht** betroffen.

---

## 3. Nur wenn du JSON für Bausteine ausgibst (`slot_contents` / `content`)

*(Abschnitt 2 für Code **nicht** anwenden.)*

- **Sprache:** knapp, **tafeltauglich**, altersgerecht; **eine** klare Aussage pro Label/Überschrift wo das Schema es erlaubt.
- **Strikte Verbote** unverändert aus dem Hauptprompt: kein HTML/CSS/JS/Markdown in Strings, keine URLs, keine Medien-Verweise.
- **Verständlichkeit:** möglichst **keine** unnötigen Doppelverneinungen oder verschachtelten Riesensätze in Langtextfeldern.
- **Konsistenz:** mehrere Slots auf einer Seite **widersprechen** sich inhaltlich nicht.

---

## 4. Arbeitsblatt (A4, JSON-Struktur)

- **Vorrang:** `generation.md` / `review.md` — **keine** Farben, Banner, Emojis oder „mach es lila“ in Aufgaben; `design_notes` nur sachlich.
- Aus **diesem** Anhang: **Klartext**, **Lesbarkeit**, sinnvolle **presentation**-Skalen — **keine** zusätzlichen „UI-Design“-Forderungen im Fließtext.
- **Kreativmodus (nur HTML/CSS):** Schriftfarben immer so wählen, dass **nie** sehr helle Schrift auf sehr hellem oder pastelligem Hintergrund liegt — Tabellenköpfe/-zellen, Infokästen und Aufgabentitel eingeschlossen. Bei Unsicherheit **dunkle Schrift auf hellem Untergrund**; Druck gedanklich mitplanen (Kontrast dort oft geringer).
- **Kreativmodus — Scroll:** **Keine** Scrollleisten **auf** der Arbeitsblatt-Seite (kein inneres Scrollen mit `overflow: auto|scroll`); Inhalt passt logisch auf die Seite oder wird über Seitenumbruch / Struktur gelöst.
- **Kreativmodus — Seitenkonsistenz:** Alle Seiten desselben Arbeitsblatts **gleich** gestalten (Typo, Farben, Abstände, Kasten-/Tabellenmuster), **außer** der Auftrag verlangt ausdrücklich oder inhaltlich eindeutig unterschiedliche Seitentypen — siehe Hauptprompt `worksheet_creative_html/generation.md`.
