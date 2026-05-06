"""Geprüfte Code-Patterns für freien Modus (Pattern-Library für Prompts).

Wir geben **kurze** Patterns mit Anker-Klassen + JS-Skelett — die KI nutzt sie als
Inspiration für robuste Touch-Interaktionen. Zu lange Snippets würden den Kontext
sprengen und sind unerwünscht.

API: ``get_relevant_snippets(intent, risk, max=3)`` matcht über
``intent.interaction_needs`` / ``intent.board_kind``.
"""
from __future__ import annotations

from typing import Any


SNIPPETS: dict[str, dict[str, Any]] = {
    'touch_slider_v1': {
        'tags': ('slider', 'simulation'),
        'title': 'Touch-Slider mit Pointer-Events',
        'pattern': '''<input type="range" class="touch-target" min="0" max="100" value="50" />
<script>
const s = document.querySelector('.touch-target');
const onChange = () => { /* update labels/visuals */ };
s.addEventListener('input', onChange, { passive: true });
s.addEventListener('pointerdown', () => s.setPointerCapture(0));
</script>''',
    },
    'drag_drop_cards_pointer_v1': {
        'tags': ('drag_drop', 'practice'),
        'title': 'Drag-Drop Karten via Pointer-Events',
        'pattern': '''<!-- .draggable hat touch-action: none aus Reset-CSS -->
<div class="draggable" data-id="a">A</div>
<div class="drop-zone" data-accepts="a"></div>
<script>
let dragging = null;
document.addEventListener('pointerdown', (e) => {
  const t = e.target.closest('.draggable');
  if (!t) return;
  dragging = t; t.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  dragging.style.transform = `translate(${e.clientX - dragging.offsetWidth/2}px, ${e.clientY - dragging.offsetHeight/2}px)`;
});
document.addEventListener('pointerup', (e) => {
  const drop = document.elementFromPoint(e.clientX, e.clientY)?.closest('.drop-zone');
  if (drop && drop.dataset.accepts === dragging.dataset.id) drop.append(dragging);
  dragging = null;
});
</script>''',
    },
    'timeline_scrubber_v1': {
        'tags': ('timeline',),
        'title': 'Zeitleiste mit Scrubber',
        'pattern': '''<input type="range" class="touch-target" min="0" max="100" value="0" />
<div class="timeline-stage"></div>
<script>
const range = document.querySelector('.touch-target');
const stage = document.querySelector('.timeline-stage');
range.addEventListener('input', () => stage.dataset.t = range.value);
</script>''',
    },
    'hotspot_panel_v1': {
        'tags': ('hotspots', 'map'),
        'title': 'Hotspot mit Detail-Panel',
        'pattern': '''<button class="hotspot touch-target" data-key="berlin">Berlin</button>
<aside class="feedback-zone" hidden></aside>
<script>
const fb = document.querySelector('.feedback-zone');
document.querySelectorAll('.hotspot').forEach((b) => {
  b.addEventListener('click', () => {
    fb.hidden = false;
    fb.textContent = `Information zu ${b.textContent}`;
  });
});
</script>''',
    },
    'quiz_cards_v1': {
        'tags': ('quiz', 'practice'),
        'title': 'Quiz-Karten mit Feedback',
        'pattern': '''<button class="touch-target" data-correct="1">Antwort A</button>
<button class="touch-target" data-correct="0">Antwort B</button>
<aside class="feedback-zone" role="status"></aside>
<script>
document.querySelectorAll('.touch-target[data-correct]').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelector('.feedback-zone').textContent =
      b.dataset.correct === '1' ? 'Richtig!' : 'Knapp daneben.';
  });
});
</script>''',
    },
    'animated_counter_v1': {
        'tags': ('process', 'simulation'),
        'title': 'Animierter Zähler (rAF, kein setInterval)',
        'pattern': '''<output class="counter">0</output>
<script>
const el = document.querySelector('.counter');
let target = 100, current = 0;
function step() {
  current += (target - current) * 0.1;
  el.textContent = Math.round(current);
  if (Math.abs(target - current) > 0.5) requestAnimationFrame(step);
}
requestAnimationFrame(step);
</script>''',
    },
    'map_layer_slider_v1': {
        'tags': ('map', 'timeline'),
        'title': 'Kartenlayer per Slider blenden',
        'pattern': '''<div class="map-stage"><div class="layer-a"></div><div class="layer-b"></div></div>
<input type="range" class="touch-target" min="0" max="100" />
<script>
const s = document.querySelector('.touch-target');
const b = document.querySelector('.layer-b');
s.addEventListener('input', () => { b.style.opacity = s.value / 100; });
</script>''',
    },
    'reveal_cards_v1': {
        'tags': ('quiz', 'practice', 'language'),
        'title': 'Aufdeck-Karten',
        'pattern': '''<button class="touch-target reveal" aria-expanded="false">Tipp</button>
<script>
document.querySelectorAll('.reveal').forEach((b) => {
  b.addEventListener('click', () => {
    const ex = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', String(!ex));
  });
});
</script>''',
    },
    'reset_state_v1': {
        'tags': ('reset',),
        'title': 'Reset-Button setzt Zustand zurück',
        'pattern': '''<button class="reset-button touch-target" type="button">Zurücksetzen</button>
<script>
document.querySelector('.reset-button').addEventListener('click', () => {
  document.querySelectorAll('[data-state]').forEach((el) => el.dataset.state = 'initial');
});
</script>''',
    },
    'responsive_board_layout_v1': {
        'tags': ('layout',),
        'title': 'Responsive Bühne mit klaren Bereichen',
        'pattern': '''<div class="free-board">
  <header class="board-header">…</header>
  <main class="main-area">…</main>
  <section class="control-zone">…</section>
  <aside class="feedback-zone"></aside>
</div>''',
    },
}


_INTERACTION_TO_TAG = {
    'slider': 'slider',
    'hotspots': 'hotspots',
    'drag_drop': 'drag_drop',
    'timeline': 'timeline',
    'quiz': 'quiz',
}


def get_relevant_snippets(intent: dict | None, risk: dict | None,  # noqa: ARG001 — risk reserviert
                          *, max_items: int = 3) -> list[dict]:
    intent = intent or {}
    needs = [str(x).lower() for x in (intent.get('interaction_needs') or [])]
    board_kind = str(intent.get('board_kind') or '').lower()

    wanted_tags: list[str] = []
    for n in needs:
        tag = _INTERACTION_TO_TAG.get(n)
        if tag and tag not in wanted_tags:
            wanted_tags.append(tag)
    if board_kind in ('map', 'timeline', 'simulation', 'quiz', 'drag_drop', 'process'):
        if board_kind not in wanted_tags:
            wanted_tags.append(board_kind)
    if not wanted_tags:
        wanted_tags = ['layout']

    selected: list[tuple[str, dict]] = []
    for snippet_id, body in SNIPPETS.items():
        if any(t in body.get('tags', ()) for t in wanted_tags):
            selected.append((snippet_id, body))
        if len(selected) >= max_items:
            break

    # Reset-/Layout-Snippets bei interaktiven Boards immer mitgeben (max_items = hart).
    if any(t in ('drag_drop', 'quiz', 'simulation', 'slider', 'timeline', 'hotspots') for t in wanted_tags):
        if 'reset_state_v1' in SNIPPETS and not any(s[0] == 'reset_state_v1' for s in selected):
            if len(selected) < max_items:
                selected.append(('reset_state_v1', SNIPPETS['reset_state_v1']))
    return [
        {'id': sid, 'title': body['title'], 'pattern': body['pattern']}
        for sid, body in selected[:max_items]
    ]


def render_snippets_for_prompt(intent: dict | None, risk: dict | None,
                                *, max_items: int = 3) -> str:
    """Markdown-Block für Generation-Prompt."""
    snippets = get_relevant_snippets(intent, risk, max_items=max_items)
    if not snippets:
        return '— keine —'
    parts: list[str] = []
    for s in snippets:
        parts.append(f'### {s["title"]} ({s["id"]})\n```\n{s["pattern"]}\n```')
    return '\n\n'.join(parts)
