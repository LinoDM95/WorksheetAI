# KI-Pipeline-Audit — Smartboard / Asset-Engine / Worksheet

Stand: 2026-05-06 · Reine Analyse, **kein Code wurde geändert**.
Quellen: `backend/apps/boards/services/*`, `backend/apps/assets/services/*`,
`backend/apps/ai/providers/*`, `backend/apps/ai/prompts/**`, `backend/.env`,
`backend/config/settings.py`.

---

## 0 Inhaltsverzeichnis

1. Pipeline-Übersicht (Map)
2. Detail: Smartboard Creative Pipeline (Phasen 1–7)
3. Detail: Asset-Engine
4. Detail: Reparatur / Stabilisierung
5. Detail: Worksheet-Pipeline
6. Token-Zählung — wie genau ist sie?
7. Preis-Umrechnung — wo es richtig sitzt und wo nicht
8. Konflikte zwischen Regeln & Prompts
9. Over-Engineering / Token-Brennpunkte
10. Empfehlungen — sortiert nach Wirkung
11. Wo es schon richtig gut sitzt

---

## 1 Pipeline-Übersicht

Drei klar getrennte KI-Strecken, mit gemeinsamer Provider-Schicht und gemeinsamem
Token-Logger:

```
                       ┌────────────────────────────────────────┐
Lehrer-Wunsch ────────►│ SmartboardCreativePipeline.generate()  │
(Boards)               │  Phase 1  Intent + Risk    (small)     │
                       │  Phase 1b Brief + StyleDNA (small)     │
                       │  Phase 1c Asset-Engine     (small+large│  ← eigene Sub-Pipeline
                       │  Phase 2  Code-Generation  (large)     │
                       │  Phase 3  Sanitize + Validate +        │
                       │           run_validation_repairs(1×)   │  (large, default 1)
                       │  Phase 4  TouchAudit (Playwright)      │
                       │           ScreenshotJudge (Playwright  │
                       │                            + small)    │
                       │  Phase 5  optional RepairAgent (large) │  ← Default OFF
                       │  Phase 6  build_quality_report (kein KI)│
                       │  Phase 7  Persist Board + Logs         │
                       └────────────────────────────────────────┘

                       ┌────────────────────────────────────────┐
Lehrer-Plan ──────────►│ FreeHtmlBlockBoardGenerationService    │
(Bausteine)            │  generate_block_contents (large/small)│
                       │  compose_board (deterministisch)       │
                       │  blocks_finishing (small, optional)    │
                       └────────────────────────────────────────┘

                       ┌────────────────────────────────────────┐
Wizard-Request ───────►│ Worksheet-Service                      │
(Arbeitsblätter)       │  generate (large)                      │
                       │  optional review (large)               │
                       │  page_regenerate (large)               │
                       └────────────────────────────────────────┘
```

Provider-Routing über `SmartboardAIModelRouter`. „klein" und „groß" werden für
**Boards/Assets** unterschiedlich konfiguriert (`SMARTBOARD_*_MODEL_*`,
`ASSET_*_MODEL_*`); Worksheet fährt komplett über `GEMINI_MODEL`.

---

## 2 Smartboard Creative Pipeline

Datei: `backend/apps/boards/services/creative_pipeline.py`

| Phase | Aufruf | Modellgröße | Pflicht? | Bemerkung |
|---|---|---|---|---|
| 1 | `IntentRouter.analyze` | small | ja | Heuristik + LLM |
| 1 | `RiskClassifier.classify` | small | ja | Regelbasiert + LLM |
| 1b | `CreativeBriefService.create` | small (high → large) | balanced/full | Heuristik + LLM |
| 1b | `StyleDNAService.create` | small | balanced/full | Heuristik + LLM |
| 1c | Asset-Engine (siehe §3) | small+large | balanced/full + Setting | optional |
| 2 | `provider.generate_free_html_board` | **large** | ja | strukturierte JSON-Antwort |
| 3 | `run_validation_repairs` | **large** ×N | ja | N=`BOARDS_FREE_HTML_MAX_REPAIR_ATTEMPTS` (Default 1) |
| 4 | `TouchAuditService.run` | kein LLM | balanced/full | Playwright oder Heuristik |
| 4 | `ScreenshotQualityJudge.run` | small | full | Playwright + LLM-Bewertung |
| 5 | `RepairAgent.run` | **large** ×N | optional | Setting `SMARTBOARD_ENABLE_PIPELINE_REPAIR_AGENT` (Default **False**) |
| 6 | `build_quality_report` | kein LLM | ja | reine Aggregation |
| 7 | `Board.objects.create` | – | ja | + `meter.flush_logs_to_board` |

### Was gut ist

- **Heuristik first, LLM zweitrangig**: Jeder kleine Schritt (`IntentRouter`,
  `RiskClassifier`, `StyleDNAService`, `CreativeBriefService`) liefert auch ohne LLM
  ein gültiges Ergebnis. Die Pipeline läuft offline / bei API-Fehler weiter.
- **Quality-Modes** (`fast` / `balanced` / `full`) sind sauber durchgereicht und
  schalten teure Schritte real ab (Brief, DNA, Audits, Asset-Engine).
- **Master-Schalter** für Pipeline (`SMARTBOARD_USE_PIPELINE`) erlaubt schnelle
  Notbremse zurück auf den klassischen `FreeHtmlBoardGenerationService`.
- **Repair-Doppelpfad**: `run_validation_repairs` (Phase 3) und `RepairAgent`
  (Phase 5) sind getrennt. Phase 5 ist Default OFF, dadurch keine teure
  Doppel-Reparatur.

### Was kritisch ist

- **`SMARTBOARD_DEFAULT_QUALITY_MODE=balanced`** + Asset-Engine an + Style DNA an +
  Touch-Audit an → ein einzelner Board-Generate ruft im Schnitt **5 – 12** kleine
  und **1 – 2** große LLM-Calls an. Für ein Klassenraum-Board ist das viel.
- **Phase 5 / `RepairAgent`** hat eine **eigene** Touch- und Visual-QA-Schleife
  (`RepairAgent.run`, Zeilen 128 ff.: `_sanitize_validate` + `run_visual_layout_qa`
  + `TouchAuditService` **pro Runde**). Bei `cap=1` sind das pro Repair-Round
  bis zu **drei Playwright-Renderings** (Sanitize-Check, Visual-QA, Touch-Audit),
  die bereits in Phase 3+4 gelaufen sind. **Doppelarbeit.**
- **Kein KI-Caching**: `free_html_generation.md` ist > 200 Zeilen und enthält
  ~80 % statische Sicherheits-/Bühnen-Regeln. Bei Gemini 2.5 / 3.x und Anthropic
  würde **Context-Caching** ~40 – 60 % Eingabe-Token einsparen — wird **nicht**
  genutzt (`generate_free_html_board` baut den Prompt neu jedes Mal, kein
  `system_instruction`-Split).
- **`creative_pipeline.py`** ruft `_select_provider` (alter Pfad) **und** parallel
  `_router` für die kleinen Phasen → zwei Provider-Resolver, zwei Code-Pfade. Bei
  einem fehlkonfigurierten `BOARDS_AI_PROVIDER=claude` würde Phase 2 Claude
  nehmen, aber Phase 1/4 weiter Gemini (siehe §8 Konflikt 5).

---

## 3 Asset-Engine

Datei: `backend/apps/assets/services/asset_pack_service.py`
Auslöser: `SmartboardCreativePipeline._build_asset_pack` (nur balanced/full).

```
AssetIntentClassifier.analyze   (small)   ← needs_custom_assets?
AssetPlanner.plan               (small)   ← ≤ 8 Assets
  for asset in plan:
    AssetStrategyRouter.decide  (small)   ← compiler / procedural / svg_free_draw / fallback / template_remix / asset_library
    for variant in 1..N (Hero=2):
      _produce_variant          (large für svg_free_draw, sonst kein LLM)
      validate_svg              (kein LLM)
      AssetQualityJudge         (Heuristik; +small wenn ASSET_QUALITY_JUDGE_LLM)
    select_best_variant
    if score < 60 OR validation NOK:
      AssetRepairAgent.repair   (large)
asset_pack_consistency          (kein LLM)
```

### Was gut ist

- Strikte **Hierarchie** (Compiler → Procedural → Template → SVG-Free-Draw →
  Fallback). Karten/Grenzen werden sicher auf `fallback_simple` festgenagelt.
- **Heuristik-Filling** dominiert; LLM nur dort, wo Compiler/Procedural fehlen.
- **Hero-Varianten** abschaltbar (`ASSET_ENABLE_HERO_VARIANTS=False`) und auf
  Default 2 gedeckelt.
- **SvgValidation** hat harte Verbote (kein `<script>`, keine `<foreignObject>`,
  keine externen URLs) und einen `svg_normalizer` als deterministischen
  Fallback-Repair.

### Was kritisch ist

- **Worst-Case Token-Volumen**: 8 Assets × Strategy(klein) + 1 Asset Hero (3 Varianten
  × `svg_free_draw` groß) + 7 Assets × `svg_free_draw` groß + 1 – 2 Repairs +
  AssetIntent + AssetPlan = **20 – 30 LLM-Calls** für ein einziges Asset-Pack.
  Selbst mit Heuristik-Anteil (Compiler/Procedural greifen oft) sind realistisch
  **8 – 14 LLM-Calls** pro Pack. **Die Asset-Engine ist die teuerste Säule der
  Pipeline.**
- **Inline-Prompts (Regelverstoß!)**: `AssetIntentClassifier._build_prompt`,
  `AssetPlanner._build_prompt`, `AssetStrategyRouter._build_prompt`,
  `AssetRepairAgent._build_prompt`, `AssetQualityJudge._call_judge` bauen den
  Prompt **als String im Python-Code**, obwohl die `prompt_loader`-Helfer
  (`build_asset_intent_prompt`, `build_asset_planner_prompt`,
  `build_asset_strategy_prompt`, `build_asset_repair_prompt`,
  `build_asset_quality_judge_prompt`) und die Markdown-Vorlagen
  (`prompts/formats/asset_engine/*.md`) **bereits existieren**. Verstößt gegen
  `backend-django.mdc`: *"AI-Prompts ausschließlich über `apps/ai/prompt_loader.py`
  laden — keine Inline-Strings in Views/Services."*
- **`AssetQualityJudge`** mischt Heuristik-Score (0 – 100) mit LLM-Rating (0 – 100)
  per **arithmetischem Mittel** (Zeile 114). Ist das LLM ungenau / halluziniert,
  zieht es einen guten Heuristik-Score nach unten (oder umgekehrt). Kein
  Konfidenzgewicht, keine Schwelle „LLM nur wenn Heuristik unsicher".
- **`AssetIntentClassifier`** rendert komplette `intent`/`brief`/`dna`-Objekte
  in den Prompt-Text per `f'{x}'` → **Python-`repr`-Format**, kein JSON. Modell
  liest dann z. B. `Intent: {'subject_area': 'history', …}`. Funktioniert,
  ist aber unsauber und token-uneffizient (Quotes verdoppelt).

---

## 4 Reparatur / Stabilisierung

Zwei verschiedene Reparatur-Mechanismen, **die nicht dasselbe tun**:

### 4.1 `run_validation_repairs` — Validierungs-Reparatur

Datei: `backend/apps/boards/services/free_html_validate_repair.py`

- Pflichtschritt nach Generierung **und** Revision.
- Nutzt **immer** `free_html_repair.md` (kein Mode).
- Cap: `BOARDS_FREE_HTML_MAX_REPAIR_ATTEMPTS=1` (also: Generierung + 1 Repair).
- Pro Runde: `_sanitize_validate_payload` + optional `run_visual_layout_qa`
  (Playwright). Liefert `[Visuell] …`-Errors als Prefix.
- **Idempotent**: bei `ok` ohne Repair erneut ausführbar.

### 4.2 `RepairAgent` — Mode-spezifische Reparatur

Datei: `backend/apps/boards/services/repair_agent.py`

- Modi (Mapping in `MODE_TO_PROMPT_KEY`): `bug_fix`, `design_improve`,
  `touch_optimize`, `layout_fix`, `performance_fix`, `performance_improve`,
  `factual_warning`, `security_fix`, `general_repair`, `content_change`,
  `simplify`, `make_more_creative`.
- 12 dedizierte Markdown-Prompts unter
  `prompts/formats/interactive_board/repair_*.md`.
- Wird genutzt von:
  - `FreeHtmlBoardRevisionService` (Lehrer drückt „Revision: bug_fix" o. ä.)
  - optional `SmartboardCreativePipeline` Phase 5 (Default OFF)
- Pro Runde **drei Audits**: sanitize+validate, Visual-QA (Playwright),
  TouchAudit (Playwright) — siehe §2 Kritik (Doppelarbeit).

### Was gut ist

- **Klare Trennung**: harte Validierungsfehler (Phase 3) vs. Audit-getriebene
  Reparaturen (Phase 5 / Revision).
- **12 Mode-Prompts**, davon viele wirklich knapp (40 – 50 Zeilen). Sehr
  schlank, gute didaktische Trennung der Aufträge (z. B. `bug_fix` =
  minimal-invasiv, `design_improve` = größerer Spielraum, Style DNA bleibt).
- **Keine Endlos-Schleifen**: Cap überall hart (`max(0, min(int(cap), 5))`), und
  Defaults stehen auf 1 statt 5 → vernünftig.

### Was kritisch ist

- **Mode-Inflation**: `MODE_TO_PROMPT_KEY` hat 13 Modi, die Repair-MD-Dateien
  sind aber **fast deckungsgleich** (gleicher Header, gleiche
  „Style DNA beibehalten"-Section, gleicher Antwort-Block). Effektiver
  semantischer Unterschied liegt **in 3 – 5 Zeilen** Direktive. Ein einziger
  Mode-Prompt mit `{{ mode_directive }}`-Variable wäre **wartbarer und** spart
  beim Update Doppel-Edits. Aktuell: bei jeder Regel-Änderung (z. B. Touch
  44 → 56 px) müssen ~10 MD-Dateien angefasst werden.
- **Generation-Prompt vs. Repair-Prompt: Kontext-Drift**: `free_html_generation.md`
  enthält die kompletten Bühnen-/Sandbox-/Touch-Regeln, `repair_*.md` aber **nicht**.
  Modell muss sich „erinnern". Bei `repair_design_improve` schreibt der Prompt
  z. B. nichts über die 1280×720-Bühne — das LLM kann hier **regredieren**.
- **`RepairAgent.needs_repair`**: weiches Kriterium
  (`screenshot_quality.overall_score < 60`). Wird `screenshot_quality_result`
  über `_dna` mit Heuristik vorbelegt (Score ~70), schlägt das Kriterium **nie**
  an → Phase 5 wird selbst bei aktiviertem Setting praktisch nie ausgelöst.
  Versteckte Konfiguration.
- **`run_validation_repairs` ist nicht mode-bewusst**: Bei Revision
  `revision_mode='bug_fix'` läuft RepairAgent (gut). Bei initialer
  Code-Generation läuft aber nur der generische `free_html_repair.md`. Dadurch
  kann eine Erst-Generierung mit grobem Layout-Bug **ohne**
  Layout-fokussierte Reparatur durchrutschen.

---

## 5 Worksheet-Pipeline

Datei: `backend/apps/boards/services/free_html_generation.py` *(falsch — die
Worksheet-Pipeline liegt unter `apps/worksheets/services/pipeline.py`; siehe Provider-Methoden `generate`, `review_worksheet`, `regenerate_page`)*.

- Schema: `SCHEMA` in `gemini.py` (komplexes verschachteltes Schema, bewusst
  detailliert). Vorteil: Modell muss strukturiert antworten. Nachteil: das
  Schema selbst kostet ~1 – 2 k Eingabe-Tokens pro Aufruf.
- **System/User-Split** (`GEMINI_PROMPT_SPLIT_SYSTEM_USER=True`) für
  `worksheet_generation` aktiv → statische Regeln in `system_instruction` →
  spätere Caches möglich. **Nur hier**, nicht bei Boards.
- Optional `GEMINI_ENABLE_REVIEW_PASS` (Default OFF) → spart einen großen
  Doppel-Call. Gut.

---

## 6 Token-Zählung — wie genau?

Datei: `backend/apps/boards/services/pipeline_ai_meter.py`

### 6.1 Echte API-Werte

| Provider | Funktion | Quelle |
|---|---|---|
| Gemini | `parse_gemini_usage(resp)` | `usage_metadata.prompt_token_count` / `candidates_token_count` (echte Werte) |
| Claude | `parse_claude_usage(message)` | `usage.input_tokens` / `usage.output_tokens` (echte Werte) |

✅ Beide nutzen die offiziellen Counter. Korrekt, kein Approximieren wenn Daten
da sind.

Zusätzlich werden **Extras** mitgenommen:

- Gemini: `total_token_count`, `thoughts_token_count`,
  `cached_content_token_count`, `tool_use_prompt_token_count`.
- Claude: `cache_creation_input_tokens`, `cache_read_input_tokens`.

### 6.2 Fallback bei fehlender Usage

- Gemini: `fallback_char_source = prompt`, dann `int(len(prompt) / 4)`.
- Claude: `int(len(user) / 4)` für input, `int(len(text) / 4)` für output.
- Mock: `int(len(json.dumps(payload)) / 4)`.

⚠️ **Approximation 4-Zeichen-pro-Token** ist die englische BPE-Faustregel.
Für **Deutsch** mit Umlauten / Zusammensetzungen liegt das oft 20 – 40 % zu
hoch oder zu niedrig. Tatsächliche Token/Char-Ratio bei deutschen
Lehrer-Prompts liegt ~3.0 – 3.5. **Akzeptabel als Schätzwert, sollte aber
selten zum Tragen kommen** — passiert nur bei API-Fehlern.

### 6.3 Was schief gehen kann

| Fall | Effekt |
|---|---|
| Provider liefert Usage = `0/0` (Meta-Antwort) | Fallback `len/4` greift, nur Input geschätzt, **Output bleibt 0** |
| Stream-Antworten ohne `usage_metadata` | Tokens fehlen, Fallback unvollständig |
| Gemini „thinking tokens" gemeldet, aber `AI_GEMINI_COUNT_THINKING_TOKENS_AS_OUTPUT=False` | Tokens werden geloggt, aber **nicht in Kosten** verrechnet |
| Claude Cache-Tokens (`cache_read_input_tokens` etc.) | gespeichert, aber **nicht in Kosten** verrechnet |
| Asset-Engine / Compiler / Procedural | **Kein** LLM-Call, also auch kein Token-Log → korrekt |

### 6.4 Bewertung

- ✅ **Echte Token-Counts**: korrekt für Gemini und Claude.
- ⚠️ **Thinking Tokens** (Gemini 2.5 / 3.x Reasoning): Default OFF in
  Kostenberechnung. Bei `gemini-2.5-pro` und insbesondere
  `gemini-3.1-pro-preview` (User-Setting) sind Thinking-Tokens ein **realer
  Kostenposten** (oft 30 – 70 % der Output-Tokens).
- ⚠️ **Cache Tokens** werden komplett ignoriert. Anthropic berechnet
  `cache_creation` mit **1.25×** und `cache_read` mit **0.10×** des Input-Preises;
  Gemini hat eigene Cache-Tarife. Aktuell wird hier 1× verrechnet → bei
  aktivem Caching wird **zu hoch** geschätzt (Cache-Read), bei
  Cache-Creation **zu niedrig**.

---

## 7 Preisumrechnung — wo es sitzt und wo nicht

Datei: `backend/apps/boards/services/pipeline_ai_meter.py::_price_per_mtok`

Logik per **String-Match auf Modellnamen**:

```text
if 'claude' in model:        → AI_CLAUDE_*_PRICE_PER_MILLION_USD
elif 'flash-lite' in model:  → AI_GEMINI_FLASH_LITE_*
elif 'flash' in model:       → AI_GEMINI_FLASH_*
elif 'preview' in model:     → AI_GEMINI_PREVIEW_* OR AI_GEMINI_25_PRO_* OR AI_GEMINI_PRO_*
elif '2.5' in model + 'pro': → AI_GEMINI_25_PRO_* OR AI_GEMINI_PRO_*
else:                        → AI_GEMINI_PRO_*
```

### 7.1 Konfiguration im aktuellen `backend/.env`

| Setting | Wert | Bewertung |
|---|---|---|
| `AI_GEMINI_FLASH_INPUT_PRICE_PER_MILLION_USD=0.30` | OK ✅ | Korrekter Preis für `gemini-2.5-flash`. |
| `AI_GEMINI_FLASH_OUTPUT_PRICE_PER_MILLION_USD=2.50` | OK ✅ | Korrekt. |
| `AI_GEMINI_PRO_INPUT_PRICE_PER_MILLION_USD=2.00` | ⚠️ | Greift als **Fallback für 2.5 Pro UND 3.1 Pro Preview**. Real: 2.5-Pro = 1.25/10 USD (≤ 200k), 3.1-Pro-Preview = anderes Tarif. |
| `AI_GEMINI_PRO_OUTPUT_PRICE_PER_MILLION_USD=12.00` | ⚠️ | Wie oben. |
| `AI_GEMINI_FLASH_LITE_*` | **fehlt** | nicht gesetzt → 0 (matcht aber nicht, da Modell nicht „lite" enthält) |
| `AI_GEMINI_PREVIEW_*` | **fehlt** | nicht gesetzt → fällt zurück auf `25_PRO` → fällt zurück auf `PRO` |
| `AI_GEMINI_25_PRO_*` | **fehlt** | nicht gesetzt → `PRO`-Fallback |
| `AI_CLAUDE_INPUT_PRICE_PER_MILLION_USD=0` | ❌ **kritisch** | `0` heißt: Claude-Kosten werden **immer 0 € geschätzt**. Bei `CLAUDE_MODEL=claude-opus-4-7` (~75 USD/1M Output) ist das ein **massiver blinder Fleck** im Cost-Reporting. |
| `AI_CLAUDE_OUTPUT_PRICE_PER_MILLION_USD=0` | ❌ | Wie oben. |
| `AI_GEMINI_COUNT_THINKING_TOKENS_AS_OUTPUT` | **fehlt** → False | Thinking-Tokens nicht in Kosten. |

### 7.2 Strukturschwächen der Preislogik

- **Claude wird nur auf einen einzigen Tarif gemappt.** Es gibt keinen
  Sonnet-/Opus-/Haiku-Split. Bei Wechsel `CLAUDE_MODEL` von Sonnet (3 USD in)
  zu Opus (15 USD in) ändert sich die Kostenschätzung **gar nicht**, weil
  derselbe Setting-Wert greift.
- **`gemini-3.1-pro-preview` matcht „preview"**, nicht „2.5". Der
  Fallback-Stack (`preview → 25_pro → pro`) ist konsistent, wenn die Settings
  aufeinander aufbauen — wenn aber jemand nur `AI_GEMINI_PRO_*` setzt (wie
  jetzt), wird ein **Preview-Modell mit Pro-Tarif** abgerechnet. Das ist
  zufällig oft nahe an der Wahrheit, aber niemand weiß es genau.
- **Kein Tier-Pricing** für lange Kontexte. Gemini 2.5 / 3.x staffelt ab
  ~200 k Input-Tokens. Aktuell: ein Preis für alles.
- **`if … or pro_in`-Verkettung** in `_price_per_mtok` wirkt wie
  Sicherheitsnetz, **versteckt aber** Konfigurationslücken — die Logs zeigen
  zwar `pricing_note: 'no_matching_price_setting'`, aber nur wenn **alle**
  Fallbacks 0 sind. Solange `AI_GEMINI_PRO_*` gesetzt ist, kommt nie eine
  Warnung.
- **Cache-Tokens werden in `metadata` durchgereicht, aber nicht
  Kosten-relevant verarbeitet.** Bei aktivem Anthropic Prompt Caching ist die
  echte Rechnung ~30 – 60 % günstiger als die Schätzung sagt.

### 7.3 Bewertung

- Token-Erfassung: **korrekt** (echte API-Werte).
- Preis-Mapping: **vereinfachtes String-Match**, brauchbar für Schätzung,
  aber:
  - **Claude-Pricing fehlt komplett (Settings = 0)** → falsche $0-Anzeige.
  - **Preview-Modell-Pricing fehlt** → falsche Pro-Schätzung.
  - **Thinking + Cache** werden nicht eingepreist.
- → **Real abweichend** kann die geschätzte Cent-Summe um ±50 % vom
  Anbieter-Rechnungsbetrag liegen. Für einen ersten Eindruck OK, für
  belastbare Cost-Reports nicht.

---

## 8 Konflikte zwischen Regeln & Prompts

### 8.1 Touch-Schwelle: 44 vs 56 vs 64 px

- `free_html_generation.md` (Generation-Prompt) sagt:
  *„Mindestgröße: Jede aktive Fläche **mindestens 44×44 px**, sinnvoll oft
  **48×48 px**."*
- `repair_touch_optimize.md` sagt: *„Mindestens **56 px** Touchflächen
  (Grundschule **64 px**)."*
- `TouchAuditService._threshold` setzt **56** (default) bzw. **64** (primary).
- `_TOUCH_AUDIT_JS` (Playwright) prüft gegen **window.__BOARDS_TOUCH_MIN__**
  (Default 56).

→ **Echter Konflikt**: Modell baut korrekt nach Generation-Prompt (44 px),
fällt durch Audit (56), verursacht eine teure Repair-Runde, die genau dasselbe
„nochmal größer" sagt. Behebt sich von selbst, kostet aber regelmäßig
unnötige Tokens.

### 8.2 „Inline asset brief" vs „Asset Pack bevorzugen"

- `free_html_generation.md` sagt:
  *„Verwende diese Assets bevorzugt statt eigene Figuren/Mascots/Hintergründe
  per `<svg>` von Hand zu zeichnen — sie sind konsistent gestyled, validiert
  und sicher."*
- Direkt darunter: *„Wenn `inline_asset_brief` im Summary vorkommt: zeichne
  diese einfachen Grafiken **direkt** im HTML als kurze Inline-SVGs."*
- `AssetPlanner._generation_mode_for` markiert procedural/template_remix-
  Assets häufig als `inline_in_board` (sobald nicht hero/high und nicht
  full_background).

→ **Mehrdeutig** für das Modell: „Pack bevorzugen, aber `inline_brief` zeichnen."
Das Modell kennt den Unterschied „Pack-Asset hat `key` und `inline_svg`" vs.
„`inline_brief`-Eintrag ist nur Beschreibung" oft nicht zuverlässig — Resultat:
**Mascots werden erneut frei gezeichnet**, Pack-Assets ignoriert. Das kostet
einen halben Asset-Engine-Lauf, der ungenutzt bleibt.

### 8.3 Provider-Settings widersprechen sich

Aktuelles `.env`:

| Setting | Wert |
|---|---|
| `AI_PROVIDER` | `gemini` |
| `BOARDS_AI_PROVIDER` | `default` (= gemini) |
| `SMARTBOARD_SMALL_MODEL_PROVIDER` | `gemini` |
| `SMARTBOARD_LARGE_MODEL_PROVIDER` | `gemini` |
| `ASSET_SMALL_MODEL_PROVIDER` | `gemini` |
| `ASSET_LARGE_MODEL_PROVIDER` | `gemini` |
| `CLAUDE_MODEL` | `claude-opus-4-7` (gesetzt!) |

Im Code-Pfad gibt es `ai_quality_tier='ultra'` → erzwingt Claude **nur** für
Phase 2 (`generate_free_html_board`). Phase 1, 1b, 1c, 4-LLM, 5 laufen weiter
über Gemini-Router. → **Mischbetrieb**: Brief auf Gemini Flash, Code auf
Claude Opus, Repair auf Gemini Pro. Ergebnisse können stilistisch
auseinanderlaufen (z. B. Style DNA von Flash trifft Code von Opus, das andere
Defaults bevorzugt).

### 8.4 `ClaudeProvider.call_with_model` ignoriert `model`-Parameter

`call_with_model(model=…)` wird im Router benutzt, um z. B. `gemini-2.5-flash`
für ein kleines Step zu wählen. ClaudeProvider akzeptiert das Argument, lädt
aber **immer** das in `settings.CLAUDE_MODEL` konfigurierte Modell:

```python
def call_with_model(self, *, model: str, …):
    """Modellname wird aktuell ignoriert (Claude-Provider hält ein einziges Modell)."""
```

→ Wenn `SMARTBOARD_SMALL_MODEL_PROVIDER=claude` und
`SMARTBOARD_SMALL_MODEL=claude-3-5-haiku`, dann wird trotzdem Opus geladen.
Bei aktuellem Setup unkritisch, aber **fragil**: ein Tippfehler im
Settings-Block würde unbemerkt zu Hochpreis-Modell-Calls für
Klassifikations-Steps führen.

### 8.5 `MAX_HTML/CSS/JS_LEN` doppelt definiert

- `free_html_sanitize.MAX_HTML_LEN = 80_000`, `MAX_CSS_LEN = 120_000`,
  `MAX_JS_LEN = 120_000` (Modul-Konstanten).
- `settings.SMARTBOARD_CODE_MAX_HTML_CHARS = 80000`, …
  (Settings-Pendants).

Beide Werte werden gepflegt, aber **nur die Modul-Konstanten greifen** im
`sanitize_free_html_bundle`. Settings sind ungenutzte Karteileiche.

### 8.6 Reparatur-MD-Dateien ohne 1280×720-Erinnerung

`repair_design_improve`, `repair_layout_fix`, `repair_make_more_creative`,
`repair_simplify`, `repair_content_change` enthalten **keine** Erinnerung an die
1280×720-Bühne, kein Touch-Min. Modell muss aus dem Code raten / aus eigenem
Prior. Das ist aktive Quelle für **Regression** beim Reparieren.

### 8.7 Cursor-Rule vs. tatsächliche Praxis

Die Backend-Rule (`backend-django.mdc`) sagt:
*„AI-Prompts ausschließlich über `apps/ai/prompt_loader.py` laden — keine
Inline-Strings in Views/Services."*

Verstöße:
- `AssetIntentClassifier._build_prompt` (Inline)
- `AssetPlanner._build_prompt` (Inline)
- `AssetStrategyRouter._build_prompt` (Inline)
- `AssetRepairAgent._build_prompt` (Inline)
- `AssetQualityJudge._call_judge` (Inline)

Die zugehörigen MD-Dateien existieren bereits unter
`prompts/formats/asset_engine/` und es gibt passende Loader-Funktionen. Der
**Asset-Stack ist also halb gebaut**: MD-Dateien da, Code nutzt sie nicht.

---

## 9 Over-Engineering / Token-Brennpunkte

### 9.1 Asset-Engine: zu viel KI für „nice-to-have"

- Asset-Pack ist optisch hilfreich, aber **funktional nicht erforderlich**: ohne
  Asset-Pack zeichnet der Code-Generator selbst (oft akzeptabel).
- Aktivierung in `balanced` (Default) → jede Generierung zahlt
  Asset-Engine-Tokens.
- **Empfehlung-Punkt**: Asset-Engine erst ab `full` aktivieren, oder per
  Lehrer-Toggle (`use_asset_engine`) — letzteres existiert, ist aber nicht
  prominent in der UI.

### 9.2 Mode-Repair-Prompts: 12 Dateien, 90 % Boilerplate

Wartung läuft schief: Touch-Schwelle ändern → 12 MDs anfassen. Konsolidierung
zu **einem** Mode-Prompt mit Variable senkt nicht die Tokens, aber die
Fehleranfälligkeit.

### 9.3 RepairAgent: dreifache Validierung pro Runde

Phase 5 bei `cap=1` und `needs_repair=True`:
- 1× Sanitize-Validate (CPU, sehr günstig)
- 1× Visual-QA (Playwright Render)
- 1× Touch-Audit (Playwright Render)
- 1× großer LLM-Call

Phase 3 hat das gerade gemacht. **Doppel-Render** für minimal mehr
Sicherheit. Sinnvoll wäre: Phase 5 vertraut den Phase-4-Ergebnissen, läuft
nur den LLM-Call und re-validiert **einmal am Ende**.

### 9.4 `free_html_generation.md` ohne Caching

- Statischer Anteil ~6 – 8 k Tokens.
- Variable Anteile ~3 – 6 k Tokens (intent/risk/brief/dna/snippets).
- Gemini & Claude unterstützen Prompt Caching (TTL Min., 75 % Rabatt).
- Aktuell: kein `system_instruction`-Split für Boards, kein `cache_control`
  bei Claude. → Pro Board werden ~6 – 8 k Eingabe-Tokens **dreimal** bezahlt:
  Generation, Validierungs-Repair, optional RepairAgent. Wäre cachebar.

### 9.5 Schema im Prompt

`SCHEMA` (Worksheet) und `FREE_HTML_SCHEMA` (Boards) werden **zusätzlich** zur
Markdown-Anweisung als JSON-Schema an Gemini gesendet (`response_schema`).
Doppelkommunikation: Modell liest Markdown („Antwort-JSON: …") + zwingend
strukturiert. Der Markdown-Schema-Block könnte entfallen → spart 200 – 500
Tokens pro Aufruf.

### 9.6 `_format_asset_pack_summary` ist sehr lang

Die kompakte Asset-Pack-Zusammenfassung kann pro Asset **300 – 600 Zeichen**
inkl. Inline-SVG-Codeblock anhängen. Bei 8 Assets sind das schnell **3 – 5 k
Eingabe-Tokens** zusätzlich. Inline-SVG im Prompt ist Token-teuer und in vielen
Fällen redundant (das Asset hat eine `key`, das Modell muss es ja gar nicht
sehen).

### 9.7 Heuristik-Doppelung Brief vs. DNA vs. IntentClassifier

- IntentRouter erfasst: `subject_area`, `grade_band`, `board_kind`,
  `interaction_needs`.
- RiskClassifier reformuliert dasselbe in Risiken.
- CreativeBrief reformuliert in `learning_goal`/`flow`.
- StyleDNA reformuliert nochmal in `mood`/`palette`/`age_style`.

Pro Service ist der Heuristik-Anteil sauber. Aber: die **Eingabe-Tokens** zu
diesen 4 LLM-Calls überschneiden sich zu ~70 % (jeder bekommt
Lehrer-Prompt + Fach + Klasse + den vorherigen Output). Mit
Zusammenführung „Brief + DNA in einem Call" wäre **1 statt 2 LLM-Aufrufe**
möglich (Schemas mergen).

---

## 10 Empfehlungen — sortiert nach Wirkung

### 🔴 Hoch (echtes Geld / echte Qualität)

1. **Claude-Pricing setzen.** `AI_CLAUDE_INPUT_PRICE_PER_MILLION_USD` und
   `…_OUTPUT_…` aus `0` auf reale Werte (Opus 4.7: ~15 / 75 USD; Sonnet:
   ~3 / 15 USD). Sonst sind alle Cent-Schätzungen für Ultra-Modus blind.
2. **Pricing pro Modell-Familie auftrennen.** Sonnet ≠ Opus ≠ Haiku.
   Vorschlag: `AI_CLAUDE_OPUS_*`, `AI_CLAUDE_SONNET_*`, `AI_CLAUDE_HAIKU_*` mit
   String-Match auf `'opus' / 'sonnet' / 'haiku' in model`.
3. **Preview-Modelle mit eigenem Pricing.** `AI_GEMINI_31_PRO_PREVIEW_*`
   (oder generischer `_PREVIEW_*`) **explizit setzen**, nicht über Pro-Fallback.
4. **Thinking-Tokens defaultmäßig in die Kostenberechnung.** Gemini 2.5+
   bezahlt sie. `AI_GEMINI_COUNT_THINKING_TOKENS_AS_OUTPUT=True` setzen ODER im
   Code-Default umstellen.
5. **Touch-Schwelle harmonisieren.** Eine Wahrheit: 56 / 64 px (Audit-Wert).
   Generation-Prompt von „≥44" auf „≥56 (Grundschule ≥64)" anpassen → spart
   regelmäßige Repair-Runde.
6. **Inline-Prompts in Asset-Engine auf `prompt_loader` umziehen.** MD-Dateien
   und Loader existieren bereits. Konsistenz, einheitliche Versionierung,
   Tests.

### 🟠 Mittel (Tokens, Wartbarkeit)

7. **Prompt-Caching aktivieren.**
   - Boards: `system_instruction`-Split wie bei Worksheet einführen
     (statische Bühnen-/Sicherheitsregeln in System, Variablen in User).
   - Claude: `cache_control` für den Sicherheits-/Bühnen-Block.
   - Erwartete Einsparung: **30 – 50 % Eingabe-Tokens** für Generation +
     Repair.
8. **Cache-Tokens in Kostenberechnung einbeziehen.** Anthropic-Faktoren
   (1.25× create, 0.10× read) und Gemini-Cache-Pricing einsetzen.
9. **Repair-MD-Dateien konsolidieren.** Ein `repair_base.md` mit `{{
   mode_directive }}` und `{{ mode_extra_rules }}` statt 12 fast-identischen
   Dateien.
10. **Repair-MDs erinnern an Bühne + Touch.** Header-Block aus
    `free_html_generation.md` (Bühne 1280×720, Touch ≥56) auch in jede
    Repair-MD übernehmen — verhindert Regressionen.
11. **Asset-Engine standardmäßig in `full`** (statt `balanced`). Spart bei
    Default-Generierungen 8 – 14 LLM-Calls.
12. **Asset-Engine: `_format_asset_pack_summary` Inline-SVG-Block weglassen.**
    Nur Key/Role/Delivery/URL referenzieren; das Modell braucht das SVG nicht
    sehen, um es per `<img src=…>` einzubinden. Spart 2 – 4 k Tokens.
13. **Phase-5 Doppelvalidierung entschärfen.** RepairAgent vertraut Phase 4
    (oder Phase 4 wird komplett in Phase 5 verschoben, wenn Phase 5 läuft).

### 🟢 Niedrig (Politur)

14. **Markdown-Schema-Block in Generation-Prompts entfernen** (Schema kommt
    bereits über `response_schema`). Spart 200 – 500 Tokens pro Aufruf.
15. **`MAX_*_CHARS`-Settings verdrahten** oder löschen — aktuell tote
    Settings.
16. **`ClaudeProvider.call_with_model(model=…)`** entweder respektieren oder
    explizit ablehnen (`raise` bei Mismatch), damit Settings-Tippfehler nicht
    silent zu falschem Modell führen.
17. **`_format_asset_pack_summary`-Konflikt** auflösen: entweder
    „Pack bevorzugen" ODER „Inline-Brief zeichnen", nicht beides
    nebeneinander.
18. **Heuristik vs. LLM Score-Mix in `AssetQualityJudge`**: Mittelwert
    durch Konfidenzgewicht ersetzen (z. B. LLM nur bei Heuristik-Score
    50 – 80, weil dort die Heuristik unsicher ist).

---

## 11 Wo es schon richtig gut sitzt

- **`generation_meter_context`** + `flush_logs_to_board` ist sauber. Pro
  Generierung ein `AIUsageLog`-Eintrag pro Step, plus SUMMARY in der Konsole.
  Sehr gutes Tooling für Kosten-Visualisierung.
- **`AIErrorMapper` + `_select_provider`-Trennung**: Provider-Wechsel
  (Gemini/Claude/Mock) ist konzentriert, View-Layer bleibt sauber.
- **Heuristik-First-Pattern** in allen Pipeline-Services ist konsequent. Die
  Pipeline funktioniert auch mit kompletter LLM-Ausfallzeit weiter — das ist
  sehr wertvoll.
- **Sanitize + Validate vor Annahme**: harte Sicherheitsregeln (kein
  `<script>`, kein fetch, kein eval, …) sind serverseitig erzwungen, Modell
  kann sie nicht „ausreden".
- **Mock-Provider deckt alle Methoden ab** inkl. `call_with_model` und
  `_stamp_usage` → Tests laufen offline und produzieren realistische Logs.
- **Quality-Modes** (`fast` / `balanced` / `full`) sind konsequent durchgereicht
  und schalten teure Schritte real ab.
- **`BOARDS_FREE_HTML_MAX_REPAIR_ATTEMPTS=1`** und
  `SMARTBOARD_MAX_AUTO_REPAIRS=1` als Default verhindern Endlos-Repair-Loops.
  Sehr gute Notbremse.
- **`run_validation_repairs`** und `RepairAgent` sind beide **idempotent** und
  defensiv (`current = {**sanitized, **{k: v for k, v in repaired.items() if v
  is not None}}` — die Reparatur kann nie ein Feld zurücknehmen).
- **Quality Report** (`build_quality_report`) ist **kein KI-Schritt**, sondern
  reine Aggregation. Saubere Trennung Audit ↔ Bewertung.
- **Sandbox-iframe** + `BOARD_DATASETS`-Bridge statt `fetch` ist sicher und
  hat einen klaren, testbaren Vertrag.
- **Worksheet-Pipeline** mit System-/User-Split (`GEMINI_PROMPT_SPLIT_SYSTEM_USER=True`)
  zeigt die richtige Richtung — das gleiche Pattern fehlt nur noch bei Boards.

---

## 12 Top-3-Sofort-Maßnahmen (wenn die Zeit knapp ist)

1. **Pricing für Claude und Preview-Modelle setzen** + Thinking-Tokens
   einrechnen → realistische Cent-Anzeige sofort.
2. **Touch-Schwelle harmonisieren** (44 → 56 in `free_html_generation.md`) →
   spart pro Generierung im Schnitt ~1 Repair-Round.
3. **System/User-Split + Prompt-Caching für Boards-Generation** → ~30 – 50 %
   weniger Eingabe-Tokens pro Board-Generierung.

Diese drei Schritte adressieren die größten **realen** Kostenposten und
Qualitätsprobleme, ohne tief in die Architektur einzugreifen.

---

## 13 Anhang — Referenz-Locations

| Thema | Datei |
|---|---|
| Pipeline-Orchestrator | `backend/apps/boards/services/creative_pipeline.py` |
| Validierungs-Repair | `backend/apps/boards/services/free_html_validate_repair.py` |
| RepairAgent | `backend/apps/boards/services/repair_agent.py` |
| Sanitize/Validate | `backend/apps/boards/services/free_html_sanitize.py` |
| Touch-Audit | `backend/apps/boards/services/touch_audit.py` |
| Visual-QA Playwright | `backend/apps/boards/services/free_html_visual_qa.py` |
| Screenshot-Judge | `backend/apps/boards/services/screenshot_quality_judge.py` |
| Style-DNA-Service | `backend/apps/boards/services/style_dna.py` |
| Creative-Brief-Service | `backend/apps/boards/services/creative_brief.py` |
| Intent + Risk | `backend/apps/boards/services/intent_router.py`, `risk_classifier.py` |
| Quality-Report | `backend/apps/boards/services/quality_report.py` |
| Snippet-Library | `backend/apps/boards/services/snippet_library.py` |
| Token + Pricing | `backend/apps/boards/services/pipeline_ai_meter.py` |
| Modell-Router | `backend/apps/boards/services/ai_model_router.py` |
| Asset-Pack-Service | `backend/apps/assets/services/asset_pack_service.py` |
| Asset-Planner | `backend/apps/assets/services/asset_planner.py` |
| Asset-Strategy-Router | `backend/apps/assets/services/asset_strategy_router.py` |
| Asset-Intent-Classifier | `backend/apps/assets/services/asset_intent_classifier.py` |
| Asset-Quality-Judge | `backend/apps/assets/services/asset_quality_judge.py` |
| Asset-Repair-Agent | `backend/apps/assets/services/asset_repair_agent.py` |
| Provider Gemini | `backend/apps/ai/providers/gemini.py` |
| Provider Claude | `backend/apps/ai/providers/claude.py` |
| Provider Mock | `backend/apps/ai/providers/mock.py` |
| Prompt-Loader | `backend/apps/ai/prompt_loader.py` |
| Generation-Prompt | `backend/apps/ai/prompts/formats/interactive_board/free_html_generation.md` |
| Repair-Prompts | `backend/apps/ai/prompts/formats/interactive_board/repair_*.md` |
| Asset-Prompts | `backend/apps/ai/prompts/formats/asset_engine/*.md` |
| Settings | `backend/config/settings.py` |
| ENV-Vorlage | `backend/.env.example` |
