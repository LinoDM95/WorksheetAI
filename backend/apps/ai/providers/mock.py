"""Mock-Provider für lokale Entwicklung — keine echte KI.

Free-HTML5-Boards werden aus drei Templates ausgewählt:
- Wasserkreislauf (Sachunterricht / Naturwissenschaft, Grundschule + Sek I)
- Europa im Zweiten Weltkrieg (Geschichte, Sek I/II) — schematisch
- Mathe-Zahlenstrahl mit Quiz (Mathe, Grundschule + Sek I)

Auswahl erfolgt heuristisch über `subject`, `topic`, `board_type`.
"""
from __future__ import annotations

import json
from typing import Any


class MockWorksheetProvider:
    def _stamp_usage(self, step_type: str, *, input_approx: int, output_approx: int) -> None:
        try:
            from apps.boards.services.pipeline_ai_meter import route_provider_usage

            route_provider_usage(
                provider_self=self,
                step_type=step_type,
                provider_label='mock',
                model_name='mock',
                input_tokens=max(0, input_approx),
                output_tokens=max(0, output_approx),
                success=True,
                metadata={'token_source': 'approx_mock'},
            )
        except Exception:
            pass

    def review_worksheet(self, content, request, page_setup, pattern):
        return content

    @staticmethod
    def _alignment_from_curriculum(payload):
        ctx = payload.get('curriculum_context')
        if not isinstance(ctx, dict) or not ctx.get('topic_area'):
            return {}
        lg = ctx.get('language_guidance') if isinstance(ctx.get('language_guidance'), dict) else {}
        ops = lg.get('operators') if isinstance(lg.get('operators'), list) else []
        avoid = lg.get('avoid_operators') if isinstance(lg.get('avoid_operators'), list) else []
        guides = []
        guides.extend(str(o) for o in ops[:6])
        guides.extend(f'vermeiden: {x}' for x in avoid[:6])
        return {
            'used_topic_area': str(ctx.get('topic_area') or ''),
            'used_subtopics': [str(x) for x in (ctx.get('subtopics') or [])[:8] if x],
            'used_competency_goals': [str(x) for x in (ctx.get('competency_goals') or [])[:8] if x],
            'used_task_types': [str(x) for x in (ctx.get('allowed_task_types') or [])[:8] if x],
            'used_language_guidance': guides[:12],
            'notes': 'Mock-Generator: Zuordnung zum mitgegebenen Curriculum-Kontext (ohne echte KI).',
        }

    def generate(self, payload):
        req = payload.get('request', {})
        topic = req.get('topic') or 'Arbeitsblatt'
        grade = int(req.get('grade_value') or req.get('grade') or 2)
        subject = req.get('subject_name') or req.get('subject') or 'Mathematik'
        pres = {
            'register': 'child_friendly',
            'text_scale': 'lg',
            'task_text_scale': 'xl',
            'heading_scale': '2xl',
            'line_height': 'relaxed',
            'density': 'sparse',
            'planning_rationale': 'Mock: eine Seite, große Schrift für Klasse %s.' % grade,
        }
        if 'addition' in topic.lower() or 'plus' in topic.lower():
            pairs = [(1, 2), (3, 4), (5, 5), (7, 8), (9, 1), (6, 6), (2, 8), (10, 5)]
            out = {
                'title': 'Plusaufgaben bis 20',
                'subtitle': '%s · Klasse %s' % (subject, grade),
                'presentation': pres,
                'pages': [{
                    'page_label': '',
                    'blocks': [
                        {'id': 'b1', 'type': 'task_grid', 'title': 'Rechne aus.', 'items': [{'label': str(i + 1), 'text': r'$%s+%s=$' % (a, b), 'answer': '$%s$' % (a + b)} for i, (a, b) in enumerate(pairs)]},
                        {'id': 'b2', 'type': 'drawing_box', 'title': 'Bonus', 'instruction': 'Erfinde zwei eigene Plusaufgaben mit Ergebnis 20.', 'height_mm': 45, 'expand_to_page_bottom': False},
                    ],
                }],
                'solutions': [{'label': str(i + 1), 'answer': '$%s$' % (a + b)} for i, (a, b) in enumerate(pairs)],
                'design_notes': ['Große Antwortkästchen, klare Struktur.'],
            }
            ca = self._alignment_from_curriculum(payload)
            if ca:
                out['curriculum_alignment'] = ca
            self._stamp_usage(
                'worksheet_generation',
                input_approx=max(8, int(len(json.dumps(payload, default=str)) / 4)),
                output_approx=max(8, int(len(json.dumps(out, default=str)) / 4)),
            )
            return out
        out = {
            'title': topic,
            'subtitle': '%s · Klasse %s' % (subject, grade),
            'presentation': {
                'register': 'neutral',
                'text_scale': 'md',
                'task_text_scale': 'md',
                'heading_scale': 'xl',
                'line_height': 'normal',
                'density': 'normal',
                'planning_rationale': 'Mock: Standardumfang, eine Seite.',
            },
            'pages': [{
                'page_label': '',
                'blocks': [
                    {'id': 'b1', 'type': 'text', 'title': 'Einstieg', 'content': 'Bearbeite die Aufgaben zum Thema %s.' % topic},
                    {'id': 'b2', 'type': 'task_list', 'title': 'Aufgaben', 'items': [
                        {'label': '1', 'text': 'Erkläre den wichtigsten Begriff.', 'answer_lines': 6},
                        {'label': '2', 'text': 'Nenne zwei Beispiele.', 'answer_lines': 5},
                        {'label': '3', 'text': 'Bearbeite eine eigene Transferfrage.', 'answer_lines': 8},
                    ]},
                ],
            }],
            'solutions': [{'label': '1', 'answer': 'Individuelle Musterlösung.'}],
            'design_notes': ['Sachlich strukturiert.'],
        }
        ca = self._alignment_from_curriculum(payload)
        if ca:
            out['curriculum_alignment'] = ca
        self._stamp_usage(
            'worksheet_generation',
            input_approx=max(8, int(len(json.dumps(payload, default=str)) / 4)),
            output_approx=max(8, int(len(json.dumps(out, default=str)) / 4)),
        )
        return out

    def regenerate_page(self, payload):
        old = payload.get('current_page') or {}
        blocks = list(old.get('blocks') or [])
        blocks.append({
            'id': 'mock-regen',
            'type': 'text',
            'title': 'Mock KI (ohne API)',
            'content': (
                'Diese Seite wurde im Mock-Modus ergänzt. '
                'Mit echtem Gemini wird die Seite vollständig neu strukturiert.'
            ),
        })
        result = {'page_label': old.get('page_label', '') or '', 'blocks': blocks}
        self._stamp_usage(
            'worksheet_page_regenerate',
            input_approx=max(8, int(len(json.dumps(payload, default=str)) / 4)),
            output_approx=max(8, int(len(json.dumps(result, default=str)) / 4)),
        )
        return result

    # ----------------------------- Free HTML5 -----------------------------

    def generate_free_html_board(self, payload: dict[str, Any]) -> dict[str, Any]:
        p = payload or {}
        template_key = self._choose_template(p)
        if template_key == 'water_cycle':
            out = _MOCK_WATER_CYCLE
        elif template_key == 'ww2_map':
            out = _MOCK_WW2_MAP
        else:
            out = _MOCK_NUMBER_LINE
        self._stamp_usage(
            'code_generation',
            input_approx=max(32, int(len(json.dumps(p, default=str)) / 4)),
            output_approx=max(32, int(len(json.dumps(out, default=str)) / 4)),
        )
        return out

    def revise_free_html_board(
        self,
        payload: dict[str, Any],
        *,
        usage_step: str = 'revision',
    ) -> dict[str, Any]:
        p = payload or {}
        note = str(p.get('user_prompt') or '').strip()[:160]
        html = str(p.get('html') or '<div class="free-board"><p>Leer</p></div>')
        css = str(p.get('css') or '')
        js = str(p.get('javascript') or '')
        used_libs = list(p.get('used_libraries') or [])
        used_assets = list(p.get('used_assets') or [])
        used_datasets = list(p.get('used_datasets') or [])

        if note:
            badge = (
                '<aside class="free-board__mock-revision" '
                'style="margin-top:1rem;padding:0.75rem 1rem;background:rgba(99,102,241,0.18);'
                'border-radius:10px;font-size:0.95rem;line-height:1.4;">'
                f'Revision (Mock): {note}</aside>'
            )
            if '</div>' in html:
                idx = html.rfind('</div>')
                html = html[:idx] + badge + html[idx:]
            else:
                html += badge

        result = {
            'title': 'Überarbeitet (Mock)',
            'description': 'Mock-Revision auf bestehenden Code angewendet.',
            'html': html,
            'css': css,
            'javascript': js,
            'teacher_notes': str(p.get('teacher_notes') or ''),
            'usage_instructions': list(p.get('usage_instructions') or []),
            'warnings': ['Mock: kein echtes LLM.'],
            'used_libraries': used_libs,
            'used_assets': used_assets,
            'used_datasets': used_datasets,
        }
        self._stamp_usage(
            usage_step,
            input_approx=max(16, int(len(json.dumps(p, default=str)) / 4)),
            output_approx=max(16, int(len(json.dumps(result, default=str)) / 4)),
        )
        return result

    def generate_block_contents(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Bausteinmodus-Filling (Mock): liefert leeres Mapping → Heuristik greift.

        Der echte LLM-Pfad würde hier {instance_id: content_dict} zurückgeben.
        Im Mock überlassen wir die Inhalte bewusst der deterministischen Heuristik
        in ``content_filling.py``, damit lokale Tests reproduzierbar sind.
        """
        in_approx = max(8, int(len(json.dumps(payload or {}, default=str)) / 4))
        self._stamp_usage('blocks_slot_fill', input_approx=in_approx, output_approx=4)
        return {}

    def call_with_model(
        self,
        *,
        model: str,
        prompt: str,
        response_schema: dict | None = None,
        temperature: float = 0.3,
        max_output_tokens: int | None = None,
        trace_step: str | None = None,
    ) -> dict[str, Any]:
        """Mock-Pendant zu :py:meth:`GeminiWorksheetProvider.call_with_model`.

        Liefert ein leeres Dict — die aufrufenden Pipeline-Services haben
        Heuristik-Fallbacks, die lokal/offline zuverlässig greifen.
        """
        if trace_step:
            from apps.boards.services.pipeline_ai_meter import route_provider_usage

            approx_in = max(0, int(len(prompt) / 4))
            route_provider_usage(
                provider_self=self,
                step_type=trace_step,
                provider_label='mock',
                model_name=model or 'mock',
                input_tokens=approx_in,
                output_tokens=2,
                success=True,
                metadata={'token_source': 'approx_mock', 'note': 'mock_response'},
            )
        return {}

    def repair_free_html_board(self, payload: dict[str, Any]) -> dict[str, Any]:
        p = payload or {}
        errs = p.get('validation_errors') or []
        if isinstance(errs, list):
            err_text = '\n'.join(str(e) for e in errs)
        else:
            err_text = str(errs)
        user_prompt = (
            'Automatische Validierungsreparatur (Mock): Behebe die gemeldeten Sandbox-/Validierungsfehler '
            'mit minimalen Änderungen.\n\nFehlerliste:\n'
            + err_text
        )
        return self.revise_free_html_board({**p, 'user_prompt': user_prompt}, usage_step='repair')

    @staticmethod
    def _choose_template(p: dict[str, Any]) -> str:
        topic = str(p.get('topic') or '').lower()
        subject = str(p.get('subject') or '').lower()
        board_type = str(p.get('board_type') or '').lower()

        history_hits = ('weltkrieg', 'ww2', 'krieg', 'europa', 'geschichte', 'history')
        water_hits = ('wasserkreislauf', 'wasser', 'water', 'verdunstung', 'kondensation')
        math_hits = ('zahlen', 'rechnen', 'math', 'plus', 'minus', 'einmaleins', 'zahlenstrahl')

        blob = f'{topic} {subject} {board_type}'
        if any(h in blob for h in water_hits):
            return 'water_cycle'
        if any(h in blob for h in history_hits):
            return 'ww2_map'
        if any(h in blob for h in math_hits) or 'mathe' in subject:
            return 'number_line'
        if board_type == 'map_board':
            return 'ww2_map'
        return 'water_cycle'


# ===================== Templates =====================

_MOCK_WATER_CYCLE: dict[str, Any] = {
    'title': 'Der Wasserkreislauf',
    'description': 'Schematische Darstellung mit Schritt-Buttons (Mock).',
    'html': """
<div class="free-board water-cycle">
  <header class="wc-header">
    <h1>Der Wasserkreislauf</h1>
    <p class="wc-step-label" id="wc-step-label">Schritt 1: Verdunstung</p>
  </header>
  <div class="wc-stage" id="wc-stage" aria-label="Szene mit Sonne, Meer, Wolken und Berg"></div>
  <nav class="wc-controls" aria-label="Schritte">
    <button type="button" class="wc-btn" data-step="evaporation">1 Verdunstung</button>
    <button type="button" class="wc-btn" data-step="condensation">2 Kondensation</button>
    <button type="button" class="wc-btn" data-step="precipitation">3 Niederschlag</button>
    <button type="button" class="wc-btn" data-step="runoff">4 Abfluss</button>
    <button type="button" class="wc-btn wc-btn--reset" data-step="reset">Zurücksetzen</button>
  </nav>
</div>
""".strip(),
    'css': """
.water-cycle {
  --c-sky: #cfe7ff;
  --c-water: #2a7fbf;
  --c-mountain: #6b7280;
  --c-sun: #f59e0b;
  --c-cloud: #f8fafc;
  --c-text: #0f172a;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--c-text);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  height: 100%;
  min-height: 100%;
  box-sizing: border-box;
  padding: 1rem 1.25rem;
  background: linear-gradient(#eaf4ff, #ffffff);
}
.water-cycle .wc-header { text-align: center; }
.water-cycle h1 { margin: 0; font-size: clamp(1.4rem, 3.4vw, 2.2rem); }
.water-cycle .wc-step-label {
  margin: 0.4rem 0 0;
  font-size: clamp(0.9rem, 2.4vw, 1.15rem);
  color: #1e40af;
  font-weight: 600;
}
.water-cycle .wc-stage {
  flex: 1 1 auto;
  min-height: 0;
  border-radius: 14px;
  background: var(--c-sky);
  position: relative;
  overflow: hidden;
}
.water-cycle .wc-stage svg { width: 100%; height: 100%; display: block; }
.water-cycle .wc-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.5rem;
}
.water-cycle .wc-btn {
  min-height: 48px;
  border: none;
  border-radius: 12px;
  background: #1d4ed8;
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  padding: 0.5rem 0.75rem;
  transition: transform 0.15s ease, background 0.15s ease;
}
.water-cycle .wc-btn:hover { transform: translateY(-1px); background: #1e40af; }
.water-cycle .wc-btn--reset { background: #475569; }
.water-cycle .wc-btn--reset:hover { background: #334155; }
.water-cycle .wc-arrow { stroke: #1d4ed8; stroke-width: 4; fill: none; opacity: 0; transition: opacity 0.4s ease; }
.water-cycle .wc-arrow.is-on { opacity: 1; }
.water-cycle .wc-droplet { fill: #1d4ed8; opacity: 0; }
.water-cycle .wc-droplet.is-on { opacity: 1; }
""".strip(),
    'javascript': r"""
(function () {
  'use strict';
  var stage = document.getElementById('wc-stage');
  var label = document.getElementById('wc-step-label');
  if (!stage || !label) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 360');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  function el(name, attrs) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]); }
    return n;
  }

  // Sun
  var sun = el('circle', { cx: 70, cy: 70, r: 32, fill: '#f59e0b' });
  svg.appendChild(sun);
  // Cloud
  var cloud = el('g', { transform: 'translate(360 70)' });
  cloud.appendChild(el('ellipse', { cx: 0, cy: 0, rx: 60, ry: 22, fill: '#ffffff' }));
  cloud.appendChild(el('ellipse', { cx: -30, cy: 6, rx: 36, ry: 18, fill: '#f8fafc' }));
  cloud.appendChild(el('ellipse', { cx: 32, cy: 6, rx: 30, ry: 16, fill: '#f8fafc' }));
  svg.appendChild(cloud);
  // Mountain
  var mountain = el('polygon', { points: '380,300 480,140 580,300', fill: '#6b7280' });
  svg.appendChild(mountain);
  // Water (sea)
  var sea = el('rect', { x: 0, y: 280, width: 600, height: 80, fill: '#2a7fbf' });
  svg.appendChild(sea);
  // Tree on the right
  var trunk = el('rect', { x: 250, y: 270, width: 12, height: 30, fill: '#7c5a2c' });
  var crown = el('circle', { cx: 256, cy: 260, r: 22, fill: '#22c55e' });
  svg.appendChild(trunk); svg.appendChild(crown);

  // Arrows
  var aEvap = el('path', { d: 'M 80 270 C 140 220, 240 180, 320 100', class: 'wc-arrow', 'data-step': 'evaporation' });
  var aCond = el('path', { d: 'M 320 90 C 350 60, 360 60, 380 70', class: 'wc-arrow', 'data-step': 'condensation' });
  var aPrec = el('path', { d: 'M 380 95 L 420 200', class: 'wc-arrow', 'data-step': 'precipitation' });
  var aRun = el('path', { d: 'M 460 220 C 360 260, 220 280, 80 280', class: 'wc-arrow', 'data-step': 'runoff' });
  [aEvap, aCond, aPrec, aRun].forEach(function (p) { svg.appendChild(p); });

  // Droplet (precipitation)
  var drop = el('circle', { cx: 415, cy: 180, r: 6, class: 'wc-droplet' });
  svg.appendChild(drop);

  stage.appendChild(svg);

  var STEPS = {
    evaporation: { label: 'Schritt 1: Verdunstung', show: ['evaporation'] },
    condensation: { label: 'Schritt 2: Kondensation', show: ['evaporation', 'condensation'] },
    precipitation: { label: 'Schritt 3: Niederschlag', show: ['evaporation', 'condensation', 'precipitation'], drop: true },
    runoff: { label: 'Schritt 4: Abfluss', show: ['evaporation', 'condensation', 'precipitation', 'runoff'], drop: true },
    reset: { label: 'Bereit. Wähle einen Schritt.', show: [] }
  };

  function applyStep(key) {
    var s = STEPS[key];
    if (!s) return;
    label.textContent = s.label;
    var arrows = svg.querySelectorAll('.wc-arrow');
    arrows.forEach(function (a) {
      var step = a.getAttribute('data-step');
      if (s.show.indexOf(step) !== -1) a.classList.add('is-on');
      else a.classList.remove('is-on');
    });
    if (s.drop) drop.classList.add('is-on'); else drop.classList.remove('is-on');
  }

  document.querySelectorAll('.wc-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { applyStep(btn.getAttribute('data-step')); });
  });

  applyStep('evaporation');
})();
""".strip(),
    'teacher_notes': 'Vier Phasen des Wasserkreislaufs zum Antippen. Eignet sich für Sachunterricht und Naturwissenschaften ab Klasse 3.',
    'usage_instructions': [
        'Buttons der Reihe nach antippen — die Pfeile bauen sich auf.',
        'Mit „Zurücksetzen" wieder von vorn starten.',
        'Wortspeicher: Verdunstung, Kondensation, Niederschlag, Abfluss.',
    ],
    'warnings': [
        'Schematische Darstellung — keine reale Skala.',
    ],
    'used_libraries': [],
    'used_assets': ['sun_soft', 'cloud_soft', 'mountain', 'water', 'tree', 'raindrop', 'arrow'],
    'used_datasets': ['water_cycle_scene'],
}


_MOCK_WW2_MAP: dict[str, Any] = {
    'title': 'Europa im Zweiten Weltkrieg — schematisch',
    'description': 'Vereinfachte Unterrichtskarte mit Zeit-Slider (Mock).',
    'html': """
<div class="free-board ww2-board">
  <header class="ww2-header">
    <h1>Europa im Zweiten Weltkrieg — schematisch</h1>
    <p class="ww2-warning">Vereinfachte Unterrichtsdarstellung, keine amtliche historische Grenzkarte.</p>
  </header>
  <div class="ww2-stage" id="ww2-stage" aria-label="Schematische Karte"></div>
  <div class="ww2-controls">
    <label class="ww2-slider-label" for="ww2-slider">Jahr</label>
    <input id="ww2-slider" class="ww2-slider" type="range" min="0" max="3" step="1" value="0" />
    <p class="ww2-step-label" id="ww2-step-label">1938 — Vorabend des Krieges</p>
  </div>
  <ul class="ww2-legend" aria-label="Legende">
    <li><span class="ww2-chip ww2-chip--axis"></span> Achsenmächte (vereinfacht)</li>
    <li><span class="ww2-chip ww2-chip--allied"></span> Alliierte / Opposition</li>
    <li><span class="ww2-chip ww2-chip--neutral"></span> Neutral / unbestimmt</li>
  </ul>
</div>
""".strip(),
    'css': """
.ww2-board {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem 1.25rem;
  width: 100%;
  height: 100%;
  min-height: 100%;
  box-sizing: border-box;
  background: linear-gradient(#fdf6e3, #ffffff);
  color: #1f2937;
}
.ww2-board h1 { margin: 0; font-size: clamp(1.25rem, 3.2vw, 2rem); }
.ww2-board .ww2-warning {
  margin: 0.3rem 0 0; padding: 0.4rem 0.7rem;
  border-radius: 8px; background: #fef3c7; color: #78350f; font-size: 0.95rem;
}
.ww2-board .ww2-stage {
  flex: 1 1 auto; min-height: 0; border-radius: 14px;
  background: #f1f5f9; overflow: hidden;
}
.ww2-board .ww2-stage svg { width: 100%; height: 100%; display: block; }
.ww2-board .ww2-controls { display: flex; flex-direction: column; gap: 0.4rem; }
.ww2-board .ww2-slider {
  width: 100%; height: 44px; touch-action: manipulation; accent-color: #1d4ed8;
}
.ww2-board .ww2-step-label {
  margin: 0; font-weight: 600; color: #1e40af;
}
.ww2-board .ww2-legend {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; font-size: 0.95rem;
}
.ww2-board .ww2-chip {
  display: inline-block; width: 16px; height: 16px; border-radius: 4px;
  margin-right: 0.4rem; vertical-align: middle; border: 1px solid rgba(0,0,0,0.15);
}
.ww2-board .ww2-chip--axis { background: #dc2626; }
.ww2-board .ww2-chip--allied { background: #2563eb; }
.ww2-board .ww2-chip--neutral { background: #94a3b8; }
.ww2-board .ww2-region { stroke: #1f2937; stroke-width: 1.2; transition: fill 0.4s ease; }
""".strip(),
    'javascript': r"""
(function () {
  'use strict';
  var stage = document.getElementById('ww2-stage');
  var slider = document.getElementById('ww2-slider');
  var step = document.getElementById('ww2-step-label');
  if (!stage || !slider || !step) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 360');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');

  // Schematische Regionen (Polygone in willkürlicher Grobform).
  var REGIONS = [
    { id: 'DE', name: 'Deutschland', d: 'M 280 150 L 330 130 L 360 170 L 340 210 L 290 215 L 270 185 Z' },
    { id: 'AT', name: 'Österreich',  d: 'M 320 215 L 360 215 L 360 245 L 320 245 Z' },
    { id: 'PL', name: 'Polen',       d: 'M 365 130 L 420 140 L 420 200 L 360 200 Z' },
    { id: 'FR', name: 'Frankreich',  d: 'M 200 195 L 270 195 L 270 260 L 210 270 Z' },
    { id: 'GB', name: 'Vereinigtes Königreich', d: 'M 200 100 L 240 95 L 240 150 L 195 155 Z' },
    { id: 'CZ', name: 'Tschechoslowakei', d: 'M 330 175 L 380 175 L 380 210 L 340 210 Z' },
    { id: 'IT', name: 'Italien',     d: 'M 290 240 L 330 250 L 320 320 L 280 310 Z' },
    { id: 'SU', name: 'Sowjetunion', d: 'M 425 110 L 590 110 L 590 270 L 425 260 Z' },
    { id: 'CH', name: 'Schweiz',     d: 'M 270 220 L 305 220 L 305 240 L 270 240 Z' },
    { id: 'ES', name: 'Spanien',     d: 'M 130 245 L 200 245 L 200 305 L 130 305 Z' }
  ];

  var STATE = {
    1938: { DE: 'axis', AT: 'axis', PL: 'neutral', FR: 'allied', GB: 'allied', CZ: 'neutral', IT: 'axis', SU: 'neutral', CH: 'neutral', ES: 'neutral' },
    1939: { DE: 'axis', AT: 'axis', PL: 'allied',  FR: 'allied', GB: 'allied', CZ: 'axis',    IT: 'axis', SU: 'neutral', CH: 'neutral', ES: 'neutral' },
    1941: { DE: 'axis', AT: 'axis', PL: 'axis',    FR: 'axis',   GB: 'allied', CZ: 'axis',    IT: 'axis', SU: 'allied',  CH: 'neutral', ES: 'neutral' },
    1945: { DE: 'allied', AT: 'allied', PL: 'allied', FR: 'allied', GB: 'allied', CZ: 'allied', IT: 'allied', SU: 'allied', CH: 'neutral', ES: 'neutral' }
  };
  var YEARS = ['1938', '1939', '1941', '1945'];
  var LABELS = {
    '1938': '1938 — Vorabend des Krieges',
    '1939': '1939 — Kriegsbeginn',
    '1941': '1941 — Höhepunkt der Achsenausdehnung',
    '1945': '1945 — Kriegsende in Europa'
  };
  var COLORS = { axis: '#dc2626', allied: '#2563eb', neutral: '#94a3b8' };

  var paths = {};
  REGIONS.forEach(function (r) {
    var p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', r.d);
    p.setAttribute('class', 'ww2-region');
    p.setAttribute('data-id', r.id);
    var t = document.createElementNS(SVG_NS, 'title');
    t.textContent = r.name;
    p.appendChild(t);
    svg.appendChild(p);
    paths[r.id] = p;
  });
  stage.appendChild(svg);

  function setYear(year) {
    var s = STATE[year] || {};
    Object.keys(paths).forEach(function (id) {
      paths[id].setAttribute('fill', COLORS[s[id] || 'neutral']);
    });
    step.textContent = LABELS[year] || year;
  }

  slider.addEventListener('input', function () {
    var v = parseInt(slider.value, 10);
    if (isNaN(v)) v = 0;
    setYear(YEARS[Math.max(0, Math.min(YEARS.length - 1, v))]);
  });
  setYear(YEARS[0]);
})();
""".strip(),
    'teacher_notes': 'Zeitslider von 1938 → 1945. Bewusst schematisch — Diskussion: Welche Vereinfachungen wurden gemacht?',
    'usage_instructions': [
        'Slider bewegen, um vier Schlüsseljahre zu vergleichen.',
        'Legende erklären: Achsenmächte, Alliierte, Neutral.',
        'Anschließend echte Karten als Vergleichsbild zeigen.',
    ],
    'warnings': [
        'Vereinfachte Unterrichtsdarstellung, keine amtliche historische Grenzkarte.',
    ],
    'used_libraries': [],
    'used_assets': ['flag', 'document'],
    'used_datasets': ['europe_ww2_demo'],
}


_MOCK_NUMBER_LINE: dict[str, Any] = {
    'title': 'Zahlenstrahl & Quiz',
    'description': 'Interaktiver Zahlenstrahl mit Quizfrage (Mock).',
    'html': """
<div class="free-board nl-board">
  <header>
    <h1>Zahlenstrahl bis 100</h1>
    <p class="nl-subtitle">Schiebe den Marker und beantworte die Frage.</p>
  </header>
  <div class="nl-stage" id="nl-stage" aria-label="Zahlenstrahl"></div>
  <div class="nl-controls">
    <label class="nl-slider-label" for="nl-slider">Wert: <span id="nl-value">50</span></label>
    <input id="nl-slider" class="nl-slider" type="range" min="0" max="100" step="1" value="50" />
  </div>
  <section class="nl-quiz" aria-live="polite">
    <p class="nl-question" id="nl-question">Welche Zahl ist um 10 größer als der Marker?</p>
    <div class="nl-options" id="nl-options"></div>
    <p class="nl-feedback" id="nl-feedback"></p>
    <button type="button" class="nl-btn" id="nl-next">Neue Frage</button>
  </section>
</div>
""".strip(),
    'css': """
.nl-board {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1rem 1.25rem;
  width: 100%;
  height: 100%;
  min-height: 100%;
  box-sizing: border-box;
  background: #ffffff;
  color: #0f172a;
}
.nl-board h1 { margin: 0; font-size: clamp(1.3rem, 3.2vw, 2rem); }
.nl-board .nl-subtitle { margin: 0.2rem 0 0; color: #475569; }
.nl-board .nl-stage { height: clamp(80px, 16vh, 130px); border-radius: 14px; background: #f1f5f9; overflow: hidden; }
.nl-board .nl-stage svg { width: 100%; height: 100%; display: block; }
.nl-board .nl-controls { display: flex; flex-direction: column; gap: 0.4rem; }
.nl-board .nl-slider {
  width: 100%; height: 44px; touch-action: manipulation; accent-color: #1d4ed8;
}
.nl-board .nl-quiz {
  border: 1px solid #e2e8f0; border-radius: 14px; padding: 1rem;
  background: #fafafa;
  display: flex; flex-direction: column; gap: 0.6rem;
}
.nl-board .nl-question { margin: 0; font-weight: 600; }
.nl-board .nl-options {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 0.5rem;
}
.nl-board .nl-option {
  min-height: 48px; border: 1px solid #cbd5e1; background: #ffffff;
  border-radius: 10px; cursor: pointer; font-size: 1.05rem;
}
.nl-board .nl-option:hover { background: #eef2ff; }
.nl-board .nl-option.is-correct { background: #d1fae5; border-color: #10b981; }
.nl-board .nl-option.is-wrong { background: #fee2e2; border-color: #ef4444; }
.nl-board .nl-feedback { margin: 0; min-height: 1.2em; font-weight: 600; }
.nl-board .nl-btn {
  align-self: flex-start; min-height: 44px; padding: 0.5rem 1rem;
  border: none; border-radius: 10px; background: #1d4ed8; color: #fff; font-size: 1rem; cursor: pointer;
}
""".strip(),
    'javascript': r"""
(function () {
  'use strict';
  var stage = document.getElementById('nl-stage');
  var slider = document.getElementById('nl-slider');
  var valueOut = document.getElementById('nl-value');
  var question = document.getElementById('nl-question');
  var optionsBox = document.getElementById('nl-options');
  var feedback = document.getElementById('nl-feedback');
  var nextBtn = document.getElementById('nl-next');
  if (!stage || !slider || !valueOut || !question || !optionsBox || !feedback || !nextBtn) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 100');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  var line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', 30); line.setAttribute('x2', 570);
  line.setAttribute('y1', 60); line.setAttribute('y2', 60);
  line.setAttribute('stroke', '#1f2937'); line.setAttribute('stroke-width', 3);
  svg.appendChild(line);

  for (var i = 0; i <= 10; i++) {
    var x = 30 + i * 54;
    var tick = document.createElementNS(SVG_NS, 'line');
    tick.setAttribute('x1', x); tick.setAttribute('x2', x);
    tick.setAttribute('y1', 50); tick.setAttribute('y2', 70);
    tick.setAttribute('stroke', '#1f2937'); tick.setAttribute('stroke-width', 2);
    svg.appendChild(tick);
    var lbl = document.createElementNS(SVG_NS, 'text');
    lbl.setAttribute('x', x); lbl.setAttribute('y', 90);
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-size', 14); lbl.setAttribute('fill', '#0f172a');
    lbl.textContent = String(i * 10);
    svg.appendChild(lbl);
  }

  var marker = document.createElementNS(SVG_NS, 'circle');
  marker.setAttribute('r', 10); marker.setAttribute('cy', 60);
  marker.setAttribute('fill', '#1d4ed8'); marker.setAttribute('stroke', '#ffffff'); marker.setAttribute('stroke-width', 2);
  svg.appendChild(marker);
  stage.appendChild(svg);

  function syncMarker(v) {
    var x = 30 + (Math.max(0, Math.min(100, v)) / 100) * 540;
    marker.setAttribute('cx', x);
    valueOut.textContent = String(v);
  }

  function buildQuestion(seed) {
    var v = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0));
    var op = (seed % 2 === 0) ? '+' : '-';
    var delta = 10;
    var correct = op === '+' ? v + delta : v - delta;
    if (correct < 0 || correct > 100) { op = '+'; correct = v + delta; }
    var distractors = [correct + 1, correct - 1, correct + 10, correct - 10, correct + 5];
    var seen = {};
    seen[correct] = true;
    var opts = [correct];
    for (var i = 0; i < distractors.length && opts.length < 4; i++) {
      var d = distractors[i];
      if (d >= 0 && d <= 200 && !seen[d]) { seen[d] = true; opts.push(d); }
    }
    while (opts.length < 4) { var x = Math.floor(Math.random() * 100); if (!seen[x]) { seen[x] = true; opts.push(x); } }
    opts.sort(function (a, b) { return a - b; });

    question.textContent = 'Welche Zahl ist um ' + delta + ' ' + (op === '+' ? 'größer' : 'kleiner') + ' als ' + v + '?';
    optionsBox.innerHTML = '';
    feedback.textContent = '';

    opts.forEach(function (o) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nl-option';
      btn.textContent = String(o);
      btn.addEventListener('click', function () {
        if (o === correct) {
          btn.classList.add('is-correct');
          feedback.textContent = 'Richtig! ' + v + ' ' + op + ' ' + delta + ' = ' + correct;
        } else {
          btn.classList.add('is-wrong');
          feedback.textContent = 'Probier es noch einmal.';
        }
      });
      optionsBox.appendChild(btn);
    });
  }

  slider.addEventListener('input', function () {
    var v = parseInt(slider.value, 10);
    if (isNaN(v)) v = 0;
    syncMarker(v);
  });
  nextBtn.addEventListener('click', function () { buildQuestion(Date.now()); });

  syncMarker(parseInt(slider.value, 10) || 50);
  buildQuestion(1);
})();
""".strip(),
    'teacher_notes': 'Schüler*innen verschieben den Marker und beantworten Plus/Minus-Fragen. Eignet sich für Klasse 2–4.',
    'usage_instructions': [
        'Marker bewegen, dann Frage beantworten.',
        '„Neue Frage" für eine andere Aufgabe.',
        'Falsche Antwort → Marker neu setzen, erneut probieren.',
    ],
    'warnings': [],
    'used_libraries': [],
    'used_assets': ['calculator'],
    'used_datasets': [],
}
