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

Wichtig: **Für Arbeitsblätter** erzeugt die KI **kein freies HTML/CSS**, sondern ein strukturiertes JSON aus Blocks. Das System rendert dieses JSON mit geprüften HTML/CSS-Komponenten — so bleiben Layout, Ränder und Druckausgabe kontrollierbar. Für **interaktive Boards (Smartboard)** gilt ein anderes Modell: dort liefert die KI freies HTML/CSS/JS, das ausschließlich in einer iframe-Sandbox läuft (siehe Abschnitt „Interaktive Boards / Smartboard").

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

## Produktion (Anwendung, ohne Container-Pipeline)

Diese Schritte setzen eine **eigene** TLS-Terminierung (z. B. Nginx/Caddy) und Prozess-Verwaltung voraus — es werden keine Docker- oder CI-Dateien mitgeliefert.

1. **Umgebung:** `DJANGO_DEBUG=False`, starkes `DJANGO_SECRET_KEY`, `ALLOWED_HOSTS`, produktives `DATABASE_URL` (z. B. PostgreSQL), `CORS_ALLOWED_ORIGINS` und `CSRF_TRUSTED_ORIGINS` auf die öffentliche Frontend-URL, `FRONTEND_PUBLIC_URL` und E-Mail (SMTP) für Passwort-Reset.
2. **Datenbankschema:** Bei neuer oder leerer PostgreSQL-Datenbank zwingend `cd backend && python manage.py migrate --noinput` ausführen, **bevor** Nutzer sich registrieren (sonst z. B. `relation "auth_user" does not exist`). Auf Render.com: **Release Command** im Web-Service, z. B. `sh release.sh` (Skript im Repo-Root) oder derselbe `migrate`-Befehl — nach dem ersten Deploy ggf. einmal per Shell ausführen, falls noch kein Release-Schritt gesetzt ist.
3. **HTTPS hinter Proxy:** `DJANGO_USE_X_FORWARDED_PROTO=True`, optional `SECURE_SSL_REDIRECT=True`, HSTS (`SECURE_HSTS_SECONDS` nur setzen, wenn dauerhaft HTTPS), `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE` (bei reinem HTTPS).
4. **Frontend bauen:** `cd frontend && npm ci && npm run build`.
5. **Django-Static:** `cd backend && python manage.py collectstatic --noinput` (WhiteNoise liefert Admin-Assets aus `STATIC_ROOT`).
6. **Optional eine Origin:** `SERVE_FRONTEND=True`, `FRONTEND_DIST_DIR` auf `../frontend/dist`; dann liefert Django das Vite-Build (`WHITENOISE_ROOT`). Catch-All für Client-Routing ist eingebaut. Alternativ Frontend separat ausliefern und nur die API unter `/api/` betreiben.
7. **Medien:** Ohne separates Gateway `SERVE_MEDIA_WITH_DJANGO=True` nur für **einen** App-Prozess; bei mehreren Instanzen gemeinsames Storage (Volume/S3) nötig.
8. **Cache:** Ohne `REDIS_URL` ist der Standard-Cache Lokmem (z. B. Passwort-Reset-Throttle nur pro Worker). Für mehrere Gunicorn-Worker `REDIS_URL` setzen (`django-redis`).
9. **App-Server:** z. B. `cd backend && gunicorn --config gunicorn.conf.py config.wsgi:application` (`GUNICORN_TIMEOUT` / `GUNICORN_GRACEFUL_TIMEOUT`, Standard je 1800 s — auch Deploy-SIGTERM verträgt laufende Pipelines länger). Bei Bedarf per Env erhöhen.
10. **Fehlerdiagnose:** optional `SENTRY_DSN`; Log-Level `DJANGO_LOG_LEVEL`.

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

## Interaktive Boards / Smartboard

Neben Druck-Arbeitsblättern erzeugt die App **interaktive HTML5-Boards** für Smartboard, Beamer oder PC. Lehrkräfte beschreiben Fach, Klasse, Thema und gewünschte Interaktionen — die KI baut daraus ein **vollständiges, in sich geschlossenes HTML5-Board** (HTML, CSS und JavaScript), das offline läuft und ausschließlich in einer Sandbox ausgeführt wird.

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
- `GET /app/boards/new` — Formular: Fach, Klasse, Thema, Dauer, **Kreativitätslevel** (kontrolliert · kreativ · experimentell), **Visueller Stil** (auto, Grundschule verspielt, Historischer Atlas, Museum, Science Lab, Math Grid, Tafel/Kreide, Dokumentarisch, frei kreativ), **Interaktionswünsche** (Schieberegler, Schritt-Buttons, Karte, Quiz, Drag&Drop usw.), Prompt-Textarea. CTA „Interaktives Board erzeugen".
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
- **Karten/Historik:** Kartenmaterial im Mock-Provider und in den Demo-Datasets ist **schematisch** — keine amtliche Grenzdarstellung. Die Prompts erzwingen einen sichtbaren Hinweis im Board, sobald historisch-politische Karten erzeugt werden.
- **Layout-Pflicht im iframe:** der KI-Prompt schreibt `min-height:100%; height:100%; width:100%; box-sizing:border-box` für `.free-board` vor und verbietet `100vh`/`100vw` sowie `position: fixed`, damit Vollbild- und 16:9-Stage-Skalierung in `BoardDetailPage` und `BoardPlayPage` zuverlässig greifen.

### Backend `.env`

```env
BOARDS_AI_PROVIDER=default        # 'mock' erzwingt offline-Generator
BOARDS_FREE_HTML_GENERATION_TEMPERATURE=0.55
BOARDS_FREE_HTML_REVISION_TEMPERATURE=0.4
```

Mit `AI_PROVIDER=mock` (oder `BOARDS_AI_PROVIDER=mock`) liefert der Mock-Provider drei deterministische Beispiel-Boards (Wasserkreislauf, schematische WW2-Karte, Mathe-Zahlenstrahl) und kann die komplette Pipeline ohne API-Key getestet werden.

### Smartboard-Kreativmodus-Pipeline

Der Kreativmodus nutzt eine **mehrstufige KI-Produktionspipeline** (`SmartboardCreativePipeline`),
die nicht „ein Prompt rein, hoffen, dass HTML funktioniert" ist, sondern eine kontrollierte
Generierungs- und Qualitätskette:

```
Lehrerprompt
→ Intent-Analyse (klein)
→ Risiko-Klassifikation (klein, regelbasiert)
→ Creative Brief (klein)
→ Style DNA (klein, mit Visual-Metaphor-Katalog)
→ HTML/CSS/JS-Generierung (groß: Gemini 2.5 Pro / Claude)
→ Static-Validation + Sanitizer (kein KI-Aufruf)
→ Browser-Smoke-Test (Playwright, optional)
→ Touch-Audit (DOM-statisch oder Playwright)
→ Screenshot-Quality-Judge (structured-only, Vision als TODO)
→ RepairAgent (mode-spezifisch, groß)
→ Quality Report (Aggregator)
→ Persistierung
```

#### Modell-Routing klein vs. groß

| Phase                 | Modell       | Begründung                                    |
|-----------------------|--------------|-----------------------------------------------|
| Intent-Analyse        | klein        | Klassifikation; Heuristik liefert Fallback    |
| Risiko-Klassifikation | klein/regeln | Regelbasis ist Quelle der Wahrheit            |
| Creative Brief        | klein¹       | Strukturierte Liste, kompaktes JSON           |
| Style DNA             | klein        | Auswahl aus Katalog + Palette-Coercion        |
| **Code-Generierung**  | **groß**     | HTML/CSS/JS — Qualität ist hier entscheidend  |
| **Code-Repair**       | **groß**     | Code muss valide bleiben                      |
| Screenshot-Judge      | klein/Vision | Vision als TODO-Hook (`SMARTBOARD_ENABLE_VISION_JUDGE`) |

¹ Bei `complexity=high|extreme` wechselt der Brief automatisch auf das große Modell.

`backend/apps/boards/services/ai_model_router.py` zentralisiert die Auswahl und schreibt
für jeden KI-Aufruf einen Eintrag in `apps.boards.AIUsageLog` (Modell, Schritt, Erfolg,
Tokens-Heuristik). Mock- und Claude-Provider implementieren ebenfalls `call_with_model`,
damit der Router providerunabhängig bleibt.

#### Quality-Modes

| Modus      | Phasen                                                                                       |
|------------|----------------------------------------------------------------------------------------------|
| `fast`     | Intent (heuristisch) + Code + Static-Validation + bestehende Repair-Loop                    |
| `balanced` | + Risk + Creative Brief + Style DNA + Touch-Audit + 1 RepairAgent-Runde                      |
| `full`     | + Screenshot-Judge + bis zu `SMARTBOARD_MAX_AUTO_REPAIRS` RepairAgent-Runden                 |

Default: `SMARTBOARD_DEFAULT_QUALITY_MODE=balanced`. Notbremse: `SMARTBOARD_USE_PIPELINE=false`
nutzt den klassischen `FreeHtmlBoardGenerationService`-Pfad ohne Audits.

#### Revisions-/Repair-Modi

`POST /api/boards/{id}/revise/` und `/auto-repair/` akzeptieren `revision_mode`:

| Mode                  | Verhalten                                                              |
|-----------------------|------------------------------------------------------------------------|
| `general`             | Klassischer Nachprompt (Default)                                       |
| `bug_fix`             | Minimale Änderungen, Funktion reparieren                               |
| `design_improve`      | Visuelle Hierarchie, Farben, Komposition; Style DNA bleibt             |
| `touch_optimize`      | Pointer-Events, ≥56 px Touchflächen, Hover-Bedienung entfernen         |
| `content_change`      | Fakten / Aufgaben / Texte präzisieren                                  |
| `simplify`            | Texte kürzen, weniger Optionen                                         |
| `make_more_creative`  | Stärker umgestalten, neue Metapher erlaubt                             |
| `performance_improve` | Animationen reduzieren, DOM/Loops vereinfachen                         |

Jeder Modus hat einen eigenen Prompt unter
`backend/apps/ai/prompts/formats/interactive_board/repair_*.md` und wird vom `RepairAgent`
(`backend/apps/boards/services/repair_agent.py`) iterativ mit Sanitize → Validate →
Touch-Audit → Visual-QA bis zu `SMARTBOARD_MAX_AUTO_REPAIRS` Runden ausgeführt.

#### Quality Report

`build_quality_report` aggregiert Audits zu einem **Ampel-Report** mit sechs Sektionen:

```
overall_status: passed | warning | failed
overall_score:  0–100
sections:       security · browser · touch · design · content · performance
```

Schwellen: `≥85 passed`, `60–85 warning`, `<60 failed` (Sicherheit < 50 → automatisch
`failed`). Im Frontend zeigt `BoardDetailPage` den Report im Tab **Qualität** mit den
Aktionen **Erneut prüfen** und **Automatisch reparieren**.

#### Was kostet KI-Tokens — und was nicht?

Tokens kosten: Intent, Risk, Brief, Style DNA, Code-Generierung, Code-Repair,
Screenshot-Judge (structured). **Keine Tokens** kosten: Sanitize, Static-Validation,
Touch-Audit (statisch oder Playwright), Browser-Smoke-Test (Playwright),
Screenshot-Erstellung (Playwright). Jeder kostende Schritt landet in `AIUsageLog`.

#### Playwright-Setup (optional)

`Browser-Smoke-Test`, `TouchAuditService` (Playwright-Pfad) und `ScreenshotQualityJudge`
benötigen Playwright + Chromium. Wenn beides nicht installiert ist, **fallen die Schritte
sauber zurück** auf statische Heuristiken und der Quality Report markiert die Sektion mit
„Browser-Smoke-Test wurde nicht ausgeführt." statt zu crashen.

```bash
cd backend
pip install playwright
python -m playwright install chromium
```

Zusätzlich braucht der Visual-QA-Pfad `BOARDS_VISUAL_QA_DOCUMENT_BASE_HREF`
(siehe `backend/.env.example`), damit das Sandbox-Dokument lokale `/board-libs/*`
und `/board-assets/*` auflösen kann.

#### Vision-Pfad (TODO)

`ScreenshotQualityJudge._evaluate_with_vision` ist ein dokumentierter Hook für
Multimodal-Bewertung mit Gemini Vision. Aktuell deaktiviert via
`SMARTBOARD_ENABLE_VISION_JUDGE=false`. Beim Aktivieren bitte:

1. Vision-fähigen Provider in `ai_model_router` durchreichen.
2. AIUsageLog-`step_type` bleibt `screenshot_judge`.
3. `ScreenshotQualityJudge.run` ruft den Pfad bevorzugt, Fallback bleibt structured.

#### Golden Examples & Snippet-Library

Damit die KI nicht jede Standardinteraktion neu erfindet:

- **Snippet-Library** (`backend/apps/boards/services/snippet_library.py`) enthält 10 geprüfte
  Code-Patterns (Touch-Slider, Pointer-Drag&Drop, Reset-State, …). Pro Generation werden bis
  zu 3 relevante Patterns in den Prompt gespiegelt.
- **Golden Examples** (`backend/apps/boards/prompt_examples/*.md`) liefern pro Fach **ein**
  kurzes Qualitätsmuster. `pick_golden_example(intent)` wählt das passendste Beispiel; das
  Markdown wird im Generation-Prompt als zusätzlicher Stilanker injiziert.

Neues Beispiel hinzufügen:

1. Markdown unter `backend/apps/boards/prompt_examples/<bereich>_<thema>_board.md` ablegen
   (kompakt halten, keine vollständigen Boards).
2. `_BY_KEY` in `backend/apps/boards/prompt_examples/__init__.py` ergänzen.
3. Bei Bedarf einen passenden Snippet-Tag in `snippet_library.py` ergänzen.

#### Smartboard-Settings (`.env`)

```env
SMARTBOARD_USE_PIPELINE=true
SMARTBOARD_SMALL_MODEL_PROVIDER=gemini
SMARTBOARD_SMALL_MODEL=gemini-2.5-flash
SMARTBOARD_LARGE_MODEL_PROVIDER=gemini
SMARTBOARD_LARGE_MODEL=gemini-2.5-pro
SMARTBOARD_DEFAULT_QUALITY_MODE=balanced
SMARTBOARD_PREMIUM_QUALITY_MODE=full
SMARTBOARD_MAX_AUTO_REPAIRS=2
SMARTBOARD_ENABLE_BROWSER_SMOKE_TEST=true
SMARTBOARD_ENABLE_TOUCH_AUDIT=true
SMARTBOARD_ENABLE_SCREENSHOT_JUDGE=true
SMARTBOARD_ENABLE_CREATIVE_BRIEF=true
SMARTBOARD_ENABLE_STYLE_DNA=true
SMARTBOARD_ENABLE_VISION_JUDGE=false
SMARTBOARD_CODE_MAX_HTML_CHARS=80000
SMARTBOARD_CODE_MAX_CSS_CHARS=120000
SMARTBOARD_CODE_MAX_JS_CHARS=120000
```

Frontend kann den aktuellen Status der Pipeline-Features über
`GET /api/boards/pipeline-status/` abfragen (z. B. um Audit-Buttons auszublenden,
wenn Playwright fehlt).

### Asset Engine

Der Kreativmodus enthält eine eigene **Asset-/SVG-/Design-Engine** (`apps.assets`),
die zwischen Style DNA und Code-Generierung läuft. Die KI ist dort
**Art Director / Asset Planner**, das System ist **Asset Compiler / SVG Builder /
QA / Registry / Composer**. Ziel: konsistente, kindgerechte, editierbare SVGs —
kein freies Improvisieren komplexer Grafiken durch das große Modell.

**Pipeline:**

```
Lehrerprompt
  → Board Creative Brief / Style DNA
  → Asset Intent Detection      (apps.assets.services.asset_intent_classifier)
  → Asset Plan                  (apps.assets.services.asset_planner)
  → Asset Strategy Router       (apps.assets.services.asset_strategy_router)
  → Asset Generation
       ├─ Procedural Generators (apps.assets.services.procedural_generators, 19 Stück)
       ├─ Mascot/Character-Compiler (apps.assets.services.mascot_compiler)
       └─ SVG Free Draw         (apps.assets.services.asset_generation, große KI)
  → SVG Lint / Normalize        (apps.assets.services.svg_validation + svg_normalizer)
  → Render / Preview            (apps.assets.services.svg_renderer)
  → Asset Quality Judge         (apps.assets.services.asset_quality_judge)
  → Asset Repair Agent          (apps.assets.services.asset_repair_agent, 7 Modi)
  → Asset Pack Consistency      (apps.assets.services.asset_pack_consistency)
  → Scene Composer              (apps.assets.services.scene_composer)
  → Free-HTML-Code-Generation (Asset Pack Summary fließt in den Code-Prompt ein)
```

**Strategien pro Asset (Heuristik + optionales KI-Refinement):**

- `compiler` — Mascot/Charakter via deterministischem Shape-Kit (`bear`, `rabbit`,
  `monster`, `generic` × Posen × Expressions).
- `procedural` — eines der 19 Standard-SVGs (sun, cloud, star, arrow, badge, …).
- `template_remix` — bekanntes Objekt (Haus, Baum, Buch …).
- `svg_free_draw` — KI generiert das SVG; danach Validate → Repair-Loop.
- `fallback_simple` — sicherer Sticker/Card statt freier Generation (z. B. Karten).
- `asset_library` — kuratiertes wiederverwendbares Asset (MVP-vorbereitet).

**Style Families** (`apps.assets.services.asset_style.STYLE_FAMILIES`, 9 Stück):
`cute_round_mascot`, `soft_cartoon`, `storybook_flat`, `clean_flat`,
`rough_handdrawn`, `classroom_icon`, `science_lab_cartoon`, `historical_atlas`,
`sticker_toy`. Wählbar im Board-Creation-Modal („Eigene Illustrationen erzeugen“ +
Stilrichtungs-Select); Default `auto` leitet aus der Style DNA ab.

**Hybrid-Auslieferung:** Der Composer entscheidet pro Asset:
- **inline** (`<svg>…</svg>` direkt im HTML) für kleine Cutout-Mascots/Icons
  (< `ASSET_INLINE_MAX_BYTES`, default 8 KB),
- **URL** (`/board-generated-assets/<uuid>.svg`) für `full_background`,
  `framed_scene` und alles Größere.

Die Auslieferungs-URL ist im Sanitizer (`free_html_sanitize.py`) und im
iframe-`<base>`/CSP whitelisted; der iframe-`<meta>`-CSP enthält
`img-src 'self' data: blob: http: https:;`. Externe `<img src="https://…">`
werden vom HTML-Sanitizer entfernt, lokale `/board-generated-assets/`-Pfade
bleiben erhalten. Der Endpoint `AssetSvgView` macht einen Owner-Check (Board-
Owner oder Public-Library) und liefert das normalisierte SVG mit eigener
strenger CSP (`default-src 'none'; style-src 'unsafe-inline'`).

**API-Endpunkte:**

```
GET    /api/assets/packs/                       — Pack-Liste (eigener Account)
GET    /api/assets/packs/<id>/                  — Pack-Detail mit Assets + Jobs
POST   /api/assets/packs/<id>/repair/           — Pack neu reparieren
POST   /api/assets/packs/<id>/select-variant/   — Variant-Auswahl (für Hero-Assets)
GET    /api/assets/<asset_id>/                  — Asset-Detail
POST   /api/assets/<asset_id>/repair/           — einzelnes Asset reparieren
POST   /api/assets/<asset_id>/mark-quality-example/
POST   /api/assets/<asset_id>/mark-reusable/
POST   /api/boards/<id>/generate-asset-pack/    — Pack nachträglich für ein Board
GET    /board-generated-assets/<uuid>.svg       — SVG-Auslieferung (Owner-Check)
```

`Board.assets_summary` (`JSONField`) speichert die `SceneComposer`-Ausgabe für die
Anzeige in `BoardDetailPage` (Tab „Assets“) und für spätere Code-Re-Generation.

**Settings (`backend/.env`):**

```env
ASSET_ENGINE_ENABLED=true
ASSET_MAX_ASSETS_PER_PACK=8
ASSET_MAX_REPAIR_ATTEMPTS=2
ASSET_ENABLE_HERO_VARIANTS=true
ASSET_HERO_VARIANT_COUNT=3
ASSET_INLINE_MAX_BYTES=8000
ASSET_SMALL_MODEL_PROVIDER=gemini
ASSET_SMALL_MODEL=gemini-2.5-flash
ASSET_LARGE_MODEL_PROVIDER=gemini
ASSET_LARGE_MODEL=gemini-2.5-pro
BOARDS_BLOCKS_FILLING_TEMPERATURE=0.45
```

Asset-spezifische `task_type`-Werte (`asset_intent`, `asset_plan`, `asset_strategy`,
`asset_svg_generation`, `asset_repair`, `asset_quality_judge`,
`asset_pack_consistency`, `asset_pack_generation`) werden vom
`SmartboardAIModelRouter` auf die `ASSET_*`-Modelle geroutet (Fallback: die
allgemeinen `SMARTBOARD_*`-Defaults). Alle Schritte werden im `AIUsageLog` als
eigene Step-Types geloggt.

**Vision-Quality-Hook (TODO):** `asset_quality_judge.py` enthält den Aufruf-
Punkt für ein Vision-Modell, das gerendertes Preview-PNG bewertet. Für den MVP
bleibt das deaktiviert, der Score läuft über die SVG-Heuristik (Pfade, Farben,
Background-Mode-Korrektheit, `<title>/<desc>`).

**Offline-Export-TODO:** Der Pack ist vollständig SVG-basiert; ein späterer
PDF-Export oder Offline-ZIP kann inline-SVGs direkt einbetten und URL-Assets aus
`AssetSvgView` herunterladen — keine externen Bilder nötig.

## Nächste sinnvolle Ausbaustufen

1. Playwright-PDF-Export im Backend, damit Preview und PDF identisch werden.
2. Mehr Pattern-Validatoren für Mathe, Sprachen, Naturwissenschaften.
3. Mehr HTML/CSS-Templates.
4. Asset-Slots mit SVG/CSS-Skins.
5. Editor für Text- und Aufgabenbearbeitung.
6. Layout-Overflow-Validator: erkennt zu lange Texte, zu viele Aufgaben, zu kleine Antwortfelder.
