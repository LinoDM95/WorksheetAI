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

Wichtig: Die KI erzeugt **kein freies HTML/CSS**, sondern ein strukturiertes JSON aus Blocks. Das System rendert dieses JSON mit geprüften HTML/CSS-Komponenten. Das ist absichtlich so, damit Layout, Ränder und Druckausgabe kontrollierbar bleiben.

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

## Nächste sinnvolle Ausbaustufen

1. Playwright-PDF-Export im Backend, damit Preview und PDF identisch werden.
2. Mehr Pattern-Validatoren für Mathe, Sprachen, Naturwissenschaften.
3. Mehr HTML/CSS-Templates.
4. Asset-Slots mit SVG/CSS-Skins.
5. Editor für Text- und Aufgabenbearbeitung.
6. Layout-Overflow-Validator: erkennt zu lange Texte, zu viele Aufgaben, zu kleine Antwortfelder.
