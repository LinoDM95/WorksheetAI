# WorksheetAI HTML A4 MVP

Ein lauffähiger MVP für KI-generierte Arbeitsblätter auf Basis von **Django + React/Vite/TypeScript + HTML/CSS A4 Rendering**.

Der MVP fokussiert auf Funktion, nicht auf finales UI-Design:

- A4-Hochformat und A4-Querformat
- echte Druckränder in mm
- Live-Vorschau des A4-Blatts mit sichtbarer Safe Area
- KI arbeitet innerhalb eines strukturierten HTML-A4-Konstrukts
- Pattern-/Vorlagenbibliothek
- Gemini-Anbindung über `.env`
- Mock-Fallback möglich
- fachliche Validierung für einfache Additions-Patterns
- HTML/CSS-Preview, Browser-Drucken/PDF als MVP-Export

## Architektur

```text
User Prompt
→ Pattern Matching
→ Gemini Slot/Block Generation
→ Validatoren
→ Render Model
→ HTML/CSS A4 Renderer
→ Browser Print/PDF
```

Wichtig: **Für Arbeitsblätter** erzeugt die KI **kein freies HTML/CSS**, sondern ein strukturiertes JSON aus Blocks. Das System rendert dieses JSON mit geprüften HTML/CSS-Komponenten — so bleiben Layout, Ränder und Druckausgabe kontrollierbar. Für **interaktive Tafelbilder (Smartboard)** gilt ein anderes Modell: dort liefert die KI freies HTML/CSS/JS, das ausschließlich in einer iframe-Sandbox läuft (siehe Abschnitt „Interaktive Tafelbilder / Smartboard").

## Gemini

Die Gemini API benötigt einen API-Key. Google beschreibt, dass Gemini API-Keys über Google AI Studio erstellt und als Umgebungsvariable genutzt werden können. Das Projekt nutzt den offiziellen `google-genai` SDK-Ansatz und strukturierte JSON-Ausgabe.

Backend `.env`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=DEIN_KEY
GEMINI_MODEL=gemini-2.5-flash
```

Ohne Key kannst du testen mit:

```env
AI_PROVIDER=mock
GEMINI_API_KEY=
```

## Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py makemigrations
python manage.py migrate
python manage.py seed_mvp_data
python manage.py seed_patterns
python manage.py createsuperuser  # optional
python manage.py runserver
```

## Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Öffne dann:

```text
http://localhost:5173
```

## Vorlagenformat

Vorlagen sind YAML/JSON Blueprints, keine PDFs. PDFs sind für Menschen gut, aber als editierbare, validierbare KI-Vorlagen unzuverlässiger.

Eine Vorlage definiert:

- Metadaten: Fach, Klasse, Schulform
- Slots: Titel, Aufgaben, Tabellen, Lösungen
- Regeln: z.B. Addition bis 20
- Layout: welches HTML-A4-Template genutzt wird
- Validierung: welche Regeln geprüft werden

## A4 Page Setup

Das Render-Modell speichert:

```json
{
  "format": "A4",
  "orientation": "portrait",
  "margins_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
  "safe_area": {"x_mm": 12, "y_mm": 12, "width_mm": 186, "height_mm": 273}
}
```

Im Frontend sieht man die Safe Area live als gestrichelten Rand. Die Inhalte werden innerhalb `.page-content` gerendert.

## Lehrplanverwaltung (RLP-PDF → CurriculumContext)

Die App `apps.curricula` verwaltet **PDF-Quellen**, **Extraktionsjobs** (KI strukturiert Text in einen `CurriculumContext`) und **Review/Freigabe**. Es werden **keine** Beispiel-Curriculum-Kontexte per Seed angelegt — bis echte PDFs importiert sind, bleibt die Datenbasis leer.

**Auto-Modus (empfohlen für komplette RLP-PDFs)**

Unter `/app/curricula/auto` lädt der Lehrer eine RLP-PDF hoch, wählt **ein Bundesland** (oder „Berlin & Brandenburg" für gemeinsamen RLP) sowie den Dokumenttyp. Es ist **kein Titel** nötig — er wird aus Bundesland + Dokumenttyp generiert.

Ablauf:

1. PDF wird hochgeladen, Text seitenweise extrahiert.
2. **Auto-Discovery**: KI identifiziert anhand von Inhaltsverzeichnis und Stichproben alle Fächer × Themenfelder × Klassenbänder mit Seitenspannen. Slices > `CURRICULUM_AUTO_MAX_PAGES_PER_SLICE` werden geteilt, Duplikate dedupliziert, Hard-Cap `CURRICULUM_AUTO_MAX_TOTAL_SLICES`.
3. **Plan bestätigen**: Lehrer sieht Liste, kann Einträge ab- oder anwählen.
4. **Auto-Extraktion**: Pro Plan-Eintrag ein KI-Aufruf, Pydantic-Validation, Fehler in Einzelnen blockieren den Lauf nicht (Fail-Soft, bis zu `CURRICULUM_AUTO_RETRY_LIMIT` Retries).
5. **Review**: Übersicht aller extrahierten Kontexte; nichts wird ohne Bestätigen aktiv.
6. **Bestätigen & aktivieren**: Ein Klick legt alle Kontexte als `active` an. Bei Berlin & Brandenburg wird **identisch verdoppelt** (1× pro Bundesland), ohne die KI ein zweites Mal zu fragen.

**Manueller Modus** (alt, weiterhin verfügbar unter `/app/curricula/sources`): einzelne Seitenbereiche selbst auswählen.

**Umgebungsvariablen** (siehe `backend/.env.example`):

- Basis: `CURRICULUM_EXTRACTION_PROVIDER`, `CURRICULUM_REQUIRE_HUMAN_REVIEW`, `CURRICULUM_MAX_PAGES_PER_EXTRACTION`, `CURRICULUM_STORE_SOURCE_EXCERPTS`, `CURRICULUM_SHOW_USAGE_TO_TEACHERS`, `CURRICULUM_MAX_SOURCE_UPLOAD_MB`.
- Auto-Modus: `CURRICULUM_AUTO_DISCOVERY_PROVIDER`, `CURRICULUM_AUTO_MAX_PAGES_PER_SLICE`, `CURRICULUM_AUTO_MAX_TOTAL_SLICES`, `CURRICULUM_AUTO_RETRY_LIMIT`, `CURRICULUM_AUTO_DISCOVERY_TEMPERATURE`.

Die bestehende App `apps.curriculum` liefert weiterhin nur `GET /api/curriculum/options/` für Wizard-Dropdowns.

## Interaktive Tafelbilder / Smartboard

Neben Druck-Arbeitsblättern erzeugt die App **interaktive HTML5-Tafelbilder** für Smartboard, Beamer oder PC. Lehrkräfte beschreiben Fach, Klasse, Thema und gewünschte Interaktionen — die KI baut daraus ein **vollständiges, in sich geschlossenes HTML5-Tafelbild** (HTML, CSS und JavaScript), das offline läuft und ausschließlich in einer Sandbox ausgeführt wird.

> Es gibt **nur noch den freien HTML5-Modus**. Der frühere strukturierte BoardSpec-/JSON-Modus wurde komplett entfernt.

### Sandbox-Modell

KI-generierter Code läuft **nie** im React-DOM der App. Stattdessen rendert das Frontend eine **iframe-Sandbox**:

- `sandbox="allow-scripts"` — **ohne** `allow-same-origin`, **ohne** `allow-forms`, `allow-popups`, `allow-downloads`, `allow-top-navigation`.
- Der iframe-Inhalt wird über `srcDoc` aufgebaut (`frontend/src/features/boards/components/free-html/buildFreeHtmlSrcDoc.ts`).
- Lokale Pflicht-Libraries (`d3.min.js`, `rough.min.js`) und optionale (`leaflet.js/.css`, `turf.min.js`, `topojson-client.min.js`) werden direkt aus `/board-libs/*` (App-Origin) geladen — der Skriptkontext bleibt aber „opaque origin", kein DOM-Zugriff auf die Eltern-App.
- Zusätzliche Verteidigung: serverseitiges **Sanitizing** und **Validierung** (`apps/boards/services/free_html_sanitize.py`) blockieren absolute http(s)-URLs (außer den freigegebenen lokalen Pfaden), `<script src=…>`-Tags, gefährliche JS-APIs (`fetch`, `eval`, `top.`, `parent.`, `location.assign`, `Worker`, `serviceWorker`, `Notification`, `geolocation`, `clipboard` …) und überlange Bundles.

**Die eigentliche Isolation ist die Sandbox** — das Sanitizing ist ein zusätzlicher Filter, kein Ersatz für die Browser-Sandbox.

### Library-, Asset- und Dataset-Pipeline

Damit die KI nur **lokal verfügbare** Ressourcen referenziert, kennt sie eine zentrale **Visual Resource Registry** (`apps/boards/services/visual_resource_registry.py`). Die Registry wird in den Generation-/Revision-Prompt eingespiegelt; die Antwort enthält `used_libraries`, `used_assets`, `used_datasets`, gegen die das Backend filtert. Unbekannte IDs werden verworfen.

- **Libraries** (immer als `<script src="/board-libs/*.js">` injiziert): `d3` und `roughjs` sind Pflicht, `leaflet`, `@turf/turf`, `topojson-client` werden bei Bedarf nachgeladen. `leaflet.css` wird zusätzlich als `<link rel="stylesheet">` im `<head>` injiziert, sobald `leaflet` in `used_libraries` steht.
- **Assets** liegen unter `frontend/public/board-assets/icons/*.svg` (Sonne, Wolke, Berg, Wasser, Pfeil, Pin, Flagge, Dokument, Lupe, Stern, Reagenzglas, Atom, Taschenrechner, Buch, freundliches Monster, Baum, Regentropfen).
- **Datasets** liegen unter `frontend/public/board-datasets/` (Wasserkreislauf, schematische Europa-Karte 1938–1945, Deutsche Einheit 1989/90).

### Lokale Sandbox-Libraries (`copy:board-libs`)

`d3` und `roughjs` sind feste Frontend-Dependencies, `leaflet`, `@turf/turf` und `topojson-client` sind `optionalDependencies`. Vor jedem Build kopiert ein Skript die Distributionen aus `node_modules/` nach `frontend/public/board-libs/`:

```bash
cd frontend
npm install
npm run copy:board-libs   # läuft automatisch via "prebuild"
npm run build
```

Fehlt eine optionale Library, überspringt das Skript sie mit Warnung; die generierten `*.js`-Dateien sind in `.gitignore`. Die `prebuild`-Verkettung sorgt dafür, dass `npm run build` immer aktuelle Bundles ausliefert.

### Routen & UI

- `GET /app/boards` — Liste; Spalte „Libraries" zeigt `used_libraries` als Chips.
- `GET /app/boards/new` — Formular: Fach, Klasse, Thema, Dauer, **Kreativitätslevel** (kontrolliert · kreativ · experimentell), **Visueller Stil** (auto, Grundschule verspielt, Historischer Atlas, Museum, Science Lab, Math Grid, Tafel/Kreide, Dokumentarisch, frei kreativ), **Interaktionswünsche** (Schieberegler, Schritt-Buttons, Karte, Quiz, Drag&Drop usw.), Prompt-Textarea. CTA „Interaktives Tafelbild erzeugen".
- `GET /app/boards/:id` — Vorschau (Sandbox-iframe) plus Tabs **Nachprompten**, **HTML**, **CSS**, **JavaScript**, **Validierung**, **Hinweise**, **Ressourcen**.
- `GET /app/boards/:id/play` — reine Vollbild-Präsentation in der iframe-Sandbox (Reload, Skript an/aus, Schließen).

### API-Endpunkte

Alle Endpunkte sind unter `/api/boards/` erreichbar und arbeiten ausschließlich auf den **flachen Feldern** `html`, `css`, `javascript`, `teacher_notes`, `usage_instructions`, `warnings`, `used_libraries`, `used_assets`, `used_datasets`, `validation_warnings`:

- `GET /api/boards/` — Liste
- `POST /api/boards/generate/` — Neuerstellung (alter Pfad `generate-free-html/` entfernt)
- `GET /api/boards/{id}/` — Detail
- `PATCH /api/boards/{id}/` — manuelle Änderungen an `title`, `description`, `html`, `css`, `javascript`, `teacher_notes`, `usage_instructions`, `warnings`; läuft immer durch Sanitizer + Validator
- `POST /api/boards/{id}/revise/` — KI-Nachprompt
- `POST /api/boards/{id}/validate/` — Validierung ohne Speichern (optional Body mit Entwurf)
- `GET /api/boards/{id}/revisions/` — Revisionshistorie (vorherige/neue HTML/CSS/JS-Stände)
- `POST /api/boards/{id}/duplicate/` — Klon inkl. aller flachen Felder
- `DELETE /api/boards/{id}/` — Löschen

Pydantic/Schema-Validierung gibt es nicht mehr — der `Board` ist ein flaches Modell und wird ausschließlich vom Sanitizer (`free_html_sanitize.py`) und vom AI-Schema (`apps/ai/providers/gemini.py::FREE_HTML_SCHEMA`) abgesichert.

### Risiken & Hinweise

- **KI-Code kann Bugs enthalten.** Lehrkräfte sollten Nachprompten, manuelle Code-Anpassung und das Validierungs-Tab nutzen und vor dem Einsatz am Gerät testen (PC, Board, Beamer).
- **Daten der bisherigen strukturierten Boards sind bei Migration `0003_flat_free_html` verloren** — strukturierte Spalten werden entfernt, nur Free-HTML-Daten werden in die flachen Felder übernommen.
- **Karten/Historik:** Kartenmaterial im Mock-Provider und in den Demo-Datasets ist **schematisch** — keine amtliche Grenzdarstellung. Die Prompts erzwingen einen sichtbaren Hinweis im Tafelbild, sobald historisch-politische Karten erzeugt werden.
- **Layout-Pflicht im iframe:** der KI-Prompt schreibt `min-height:100%; height:100%; width:100%; box-sizing:border-box` für `.free-board` vor und verbietet `100vh`/`100vw` sowie `position: fixed`, damit Vollbild- und 16:9-Stage-Skalierung in `BoardDetailPage` und `BoardPlayPage` zuverlässig greifen.

### Backend `.env`

```env
BOARDS_AI_PROVIDER=default        # 'mock' erzwingt offline-Generator
BOARDS_FREE_HTML_GENERATION_TEMPERATURE=0.55
BOARDS_FREE_HTML_REVISION_TEMPERATURE=0.4
```

Mit `AI_PROVIDER=mock` (oder `BOARDS_AI_PROVIDER=mock`) liefert der Mock-Provider drei deterministische Beispiel-Tafelbilder (Wasserkreislauf, schematische WW2-Karte, Mathe-Zahlenstrahl) und kann die komplette Pipeline ohne API-Key getestet werden.

## Nächste sinnvolle Ausbaustufen

1. Playwright-PDF-Export im Backend, damit Preview und PDF identisch werden.
2. Mehr Pattern-Validatoren für Mathe, Sprachen, Naturwissenschaften.
3. Mehr HTML/CSS-Templates.
4. Asset-Slots mit SVG/CSS-Skins.
5. Editor für Text- und Aufgabenbearbeitung.
6. Layout-Overflow-Validator: erkennt zu lange Texte, zu viele Aufgaben, zu kleine Antwortfelder.
