"""Universelle Bausteine (ohne externe Libraries).

Jede ``render_*``-Funktion ist deterministisch und gibt
``{html, css, js, used_libraries}`` zurück.

* ``html`` — Fragment, das in einer Slide eingebettet wird
* ``css``  — *einmaliges* Klassen-CSS pro Blocktyp (wird im Compose dedupliziert
  per Klassen-Suffix); zusätzlich nutzt jeder Baustein die gemeinsamen
  ``--bb-*`` CSS-Variablen aus dem Theme.
* ``js``   — IIFE, scoped per Instanz-ID (kein Globals-Pollution)
* ``used_libraries`` — Lib-IDs (z. B. ``chartjs``); leer für Universal-Bausteine
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from ._helpers import block_id, esc, js_str
from .themes import Theme


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class TextkarteContent(BaseModel):
    title: str = Field(default='', max_length=160)
    body: str = Field(default='', max_length=600)
    merksatz: str = Field(default='', max_length=300)


class AufdeckkarteContent(BaseModel):
    front: str = Field(default='', max_length=200)
    back: str = Field(default='', max_length=400)
    hint: str = Field(default='', max_length=120)


class SchrittItem(BaseModel):
    title: str = Field(default='', max_length=120)
    body: str = Field(default='', max_length=400)


class SchrittContent(BaseModel):
    title: str = Field(default='', max_length=160)
    steps: list[SchrittItem] = Field(default_factory=list)

    @field_validator('steps')
    @classmethod
    def _limit_steps(cls, v: list[SchrittItem]) -> list[SchrittItem]:
        if len(v) > 8:
            raise ValueError('Maximal 8 Schritte erlaubt')
        if len(v) < 2:
            raise ValueError('Mindestens 2 Schritte nötig')
        return v


class MultipleChoiceOption(BaseModel):
    text: str = Field(default='', max_length=180)
    correct: bool = False


class MultipleChoiceContent(BaseModel):
    question: str = Field(default='', max_length=240)
    options: list[MultipleChoiceOption] = Field(default_factory=list)
    explanation: str = Field(default='', max_length=300)

    @field_validator('options')
    @classmethod
    def _limit_options(cls, v: list[MultipleChoiceOption]) -> list[MultipleChoiceOption]:
        if not 2 <= len(v) <= 4:
            raise ValueError('Multiple Choice braucht 2–4 Antworten')
        if not any(o.correct for o in v):
            raise ValueError('Mindestens eine Antwort muss korrekt sein')
        return v


class RichtigFalschItem(BaseModel):
    text: str = Field(default='', max_length=240)
    correct: bool = False


class RichtigFalschContent(BaseModel):
    title: str = Field(default='', max_length=160)
    statements: list[RichtigFalschItem] = Field(default_factory=list)

    @field_validator('statements')
    @classmethod
    def _limit(cls, v: list[RichtigFalschItem]) -> list[RichtigFalschItem]:
        if not 2 <= len(v) <= 8:
            raise ValueError('Brauche 2–8 Aussagen')
        return v


class SortierContent(BaseModel):
    title: str = Field(default='', max_length=160)
    items: list[str] = Field(default_factory=list)

    @field_validator('items')
    @classmethod
    def _limit(cls, v: list[str]) -> list[str]:
        if not 3 <= len(v) <= 8:
            raise ValueError('Brauche 3–8 Karten')
        return [str(x)[:120] for x in v]


class ZuordnungPair(BaseModel):
    left: str = Field(default='', max_length=120)
    right: str = Field(default='', max_length=180)


class ZuordnungContent(BaseModel):
    title: str = Field(default='', max_length=160)
    pairs: list[ZuordnungPair] = Field(default_factory=list)

    @field_validator('pairs')
    @classmethod
    def _limit(cls, v: list[ZuordnungPair]) -> list[ZuordnungPair]:
        if not 2 <= len(v) <= 6:
            raise ValueError('Brauche 2–6 Paare')
        return v


class LueckentextSatz(BaseModel):
    text: str = Field(default='', max_length=240)
    answer: str = Field(default='', max_length=80)

    @field_validator('text')
    @classmethod
    def _has_gap(cls, v: str) -> str:
        if '___' not in v:
            raise ValueError('Lückenmarker "___" fehlt im Satz')
        return v


class LueckentextContent(BaseModel):
    title: str = Field(default='', max_length=160)
    sentences: list[LueckentextSatz] = Field(default_factory=list)
    extra_words: list[str] = Field(default_factory=list)

    @field_validator('sentences')
    @classmethod
    def _limit(cls, v: list[LueckentextSatz]) -> list[LueckentextSatz]:
        if not 1 <= len(v) <= 5:
            raise ValueError('Brauche 1–5 Sätze')
        return v

    @field_validator('extra_words')
    @classmethod
    def _limit_extras(cls, v: list[str]) -> list[str]:
        if len(v) > 6:
            raise ValueError('Maximal 6 Distraktoren')
        return [str(x)[:60] for x in v if x]


WortartTag = Literal['nomen', 'verb', 'adjektiv', 'sonstiges']


class WortartenContent(BaseModel):
    title: str = Field(default='', max_length=160)
    sentence: str = Field(default='', max_length=240)
    solution: dict[str, WortartTag] = Field(default_factory=dict)

    @field_validator('sentence')
    @classmethod
    def _has_words(cls, v: str) -> str:
        if len(v.split()) < 3:
            raise ValueError('Satz braucht mindestens 3 Wörter')
        return v


ProContraSide = Literal['pro', 'contra']


class ProContraArgument(BaseModel):
    text: str = Field(default='', max_length=200)
    side: ProContraSide = 'pro'


class ProContraContent(BaseModel):
    title: str = Field(default='', max_length=160)
    arguments: list[ProContraArgument] = Field(default_factory=list)

    @field_validator('arguments')
    @classmethod
    def _limit(cls, v: list[ProContraArgument]) -> list[ProContraArgument]:
        if not 4 <= len(v) <= 10:
            raise ValueError('Brauche 4–10 Argumente')
        return v


# ---------------------------------------------------------------------------
# Renderer
# ---------------------------------------------------------------------------
def _empty_used() -> dict[str, list[str]]:
    return {'used_libraries': [], 'used_assets': [], 'used_datasets': []}


def render_textkarte(content: TextkarteContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('tx', content.title or 'k')
    has_merk = bool(content.merksatz)
    html = f'''
<article class="bb-block bb-textkarte" data-bb="textkarte" id="{bid}">
  <h3 class="bb-textkarte__title">{esc(content.title)}</h3>
  <div class="bb-textkarte__body">{esc(content.body)}</div>
  {('<button type="button" class="bb-textkarte__merk-btn" data-bb-merk="' + bid + '" aria-expanded="false">Merksatz zeigen</button>' +
    '<aside class="bb-textkarte__merk" hidden>' + esc(content.merksatz) + '</aside>') if has_merk else ''}
</article>
'''.strip()
    css = '''
.bb-textkarte { padding: var(--bb-gap-md); border-radius: var(--bb-radius-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); box-shadow: var(--bb-shadow-card); display: flex; flex-direction: column; gap: var(--bb-gap-sm); height: 100%; }
.bb-textkarte__title { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); line-height: var(--bb-line-height-tight); }
.bb-textkarte__body { font-size: var(--bb-font-size-md); line-height: var(--bb-line-height-normal); color: var(--bb-text); }
.bb-textkarte__merk-btn { align-self: flex-start; min-height: var(--bb-touch-min); padding: 0 var(--bb-gap-md); border-radius: var(--bb-radius-sm); border: 0; background: var(--bb-primary); color: var(--bb-primary-text); font-size: var(--bb-font-size-md); cursor: pointer; }
.bb-textkarte__merk-btn:focus-visible { outline: 3px solid var(--bb-focus); outline-offset: 2px; }
.bb-textkarte__merk { margin: 0; padding: var(--bb-gap-sm) var(--bb-gap-md); background: var(--bb-bg-chip); border-radius: var(--bb-radius-sm); font-size: var(--bb-font-size-md); font-weight: 600; color: var(--bb-text); }
'''
    js = ('''
(function(){
  var btn = document.querySelector('[data-bb-merk="''' + bid + '''"]');
  if (!btn) return;
  var card = document.getElementById(''' + js_str(bid) + ''');
  var aside = card ? card.querySelector('.bb-textkarte__merk') : null;
  if (!aside) return;
  btn.addEventListener('click', function(){
    var open = !aside.hasAttribute('hidden') ? false : true;
    if (open) { aside.removeAttribute('hidden'); btn.setAttribute('aria-expanded','true'); btn.textContent = 'Merksatz verbergen'; }
    else { aside.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); btn.textContent = 'Merksatz zeigen'; }
  });
})();
''') if has_merk else ''
    return {'html': html, 'css': css, 'js': js, **_empty_used()}


def render_aufdeckkarte(content: AufdeckkarteContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('ak', content.front or 'k')
    html = f'''
<article class="bb-block bb-aufdeck" id="{bid}" data-bb="aufdeckkarte">
  <button type="button" class="bb-aufdeck__face" data-bb-flip="{bid}" aria-pressed="false">
    <span class="bb-aufdeck__front">{esc(content.front)}</span>
    <span class="bb-aufdeck__back" hidden>{esc(content.back)}</span>
  </button>
  {('<p class="bb-aufdeck__hint">' + esc(content.hint) + '</p>') if content.hint else ''}
</article>
'''.strip()
    css = '''
.bb-aufdeck { display: flex; flex-direction: column; gap: var(--bb-gap-sm); height: 100%; }
.bb-aufdeck__face { flex: 1 1 auto; border: 0; border-radius: var(--bb-radius-md); padding: var(--bb-gap-md); background: var(--bb-bg-card); box-shadow: var(--bb-shadow-card); border: var(--bb-border-subtle); cursor: pointer; font-family: inherit; font-size: var(--bb-font-size-xl); color: var(--bb-text); display: flex; align-items: center; justify-content: center; text-align: center; min-height: 140px; }
.bb-aufdeck__face[aria-pressed="true"] { background: var(--bb-bg-chip); }
.bb-aufdeck__face:focus-visible { outline: 3px solid var(--bb-focus); outline-offset: 2px; }
.bb-aufdeck__hint { margin: 0; font-size: var(--bb-font-size-sm); color: var(--bb-text-muted); text-align: center; }
'''
    js = '''
(function(){
  var btn = document.querySelector('[data-bb-flip="''' + bid + '''"]');
  if (!btn) return;
  var f = btn.querySelector('.bb-aufdeck__front');
  var b = btn.querySelector('.bb-aufdeck__back');
  if (!f || !b) return;
  btn.addEventListener('click', function(){
    var pressed = btn.getAttribute('aria-pressed') === 'true';
    if (pressed) { f.removeAttribute('hidden'); b.setAttribute('hidden',''); btn.setAttribute('aria-pressed','false'); }
    else { f.setAttribute('hidden',''); b.removeAttribute('hidden'); btn.setAttribute('aria-pressed','true'); }
  });
})();
'''
    return {'html': html, 'css': css, 'js': js, **_empty_used()}


def render_schritt(content: SchrittContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('st', content.title or 'st')
    items_html = []
    for i, step in enumerate(content.steps):
        items_html.append(
            f'<li class="bb-schritt__item" data-bb-step="{i}" hidden>'
            f'  <div class="bb-schritt__index">{i + 1}</div>'
            f'  <h4 class="bb-schritt__title">{esc(step.title)}</h4>'
            f'  <p class="bb-schritt__body">{esc(step.body)}</p>'
            f'</li>'
        )
    html = f'''
<article class="bb-block bb-schritt" id="{bid}" data-bb="schritt">
  <header class="bb-schritt__head">
    <h3 class="bb-schritt__heading">{esc(content.title)}</h3>
    <div class="bb-schritt__progress" aria-live="polite" data-bb-progress="{bid}">1 / {len(content.steps)}</div>
  </header>
  <ol class="bb-schritt__list" data-bb-list="{bid}">
    {''.join(items_html)}
  </ol>
  <nav class="bb-schritt__nav" aria-label="Schritte navigieren">
    <button type="button" class="bb-btn bb-btn--ghost" data-bb-step-prev="{bid}">‹ Zurück</button>
    <button type="button" class="bb-btn bb-btn--primary" data-bb-step-next="{bid}">Weiter ›</button>
    <button type="button" class="bb-btn bb-btn--ghost" data-bb-step-reset="{bid}">Zurücksetzen</button>
  </nav>
</article>
'''.strip()
    css = '''
.bb-schritt { display: flex; flex-direction: column; gap: var(--bb-gap-sm); padding: var(--bb-gap-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); border-radius: var(--bb-radius-md); box-shadow: var(--bb-shadow-card); height: 100%; }
.bb-schritt__head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--bb-gap-sm); }
.bb-schritt__heading { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); }
.bb-schritt__progress { font-size: var(--bb-font-size-sm); color: var(--bb-text-muted); font-variant-numeric: tabular-nums; }
.bb-schritt__list { list-style: none; padding: 0; margin: 0; flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.bb-schritt__item { display: grid; grid-template-columns: auto 1fr; column-gap: var(--bb-gap-md); row-gap: 4px; padding: var(--bb-gap-sm) 0; }
.bb-schritt__index { grid-row: 1 / 3; width: 44px; height: 44px; border-radius: 999px; background: var(--bb-primary); color: var(--bb-primary-text); display: flex; align-items: center; justify-content: center; font-size: var(--bb-font-size-lg); font-weight: 700; }
.bb-schritt__title { margin: 0; font-size: var(--bb-font-size-lg); color: var(--bb-text); }
.bb-schritt__body { margin: 0; font-size: var(--bb-font-size-md); color: var(--bb-text); line-height: var(--bb-line-height-normal); }
.bb-schritt__nav { display: flex; gap: var(--bb-gap-sm); }
'''
    js = '''
(function(){
  var bid = ''' + js_str(bid) + ''';
  var list = document.querySelector('[data-bb-list="' + bid + '"]');
  var prog = document.querySelector('[data-bb-progress="' + bid + '"]');
  var prev = document.querySelector('[data-bb-step-prev="' + bid + '"]');
  var next = document.querySelector('[data-bb-step-next="' + bid + '"]');
  var reset = document.querySelector('[data-bb-step-reset="' + bid + '"]');
  if (!list || !prog || !prev || !next || !reset) return;
  var items = Array.prototype.slice.call(list.querySelectorAll('[data-bb-step]'));
  var idx = 0;
  function show() {
    items.forEach(function(el, i){ if (i === idx) el.removeAttribute('hidden'); else el.setAttribute('hidden',''); });
    prog.textContent = (idx + 1) + ' / ' + items.length;
    prev.disabled = idx === 0;
    next.disabled = idx === items.length - 1;
  }
  prev.addEventListener('click', function(){ if (idx > 0) { idx -= 1; show(); } });
  next.addEventListener('click', function(){ if (idx < items.length - 1) { idx += 1; show(); } });
  reset.addEventListener('click', function(){ idx = 0; show(); });
  show();
})();
'''
    return {'html': html, 'css': css, 'js': js, **_empty_used()}


def render_multiple_choice(content: MultipleChoiceContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('mc', content.question or 'mc')
    opts_html = []
    correct_indexes: list[int] = []
    for i, opt in enumerate(content.options):
        if opt.correct:
            correct_indexes.append(i)
        opts_html.append(
            f'<button type="button" class="bb-mc__opt" data-bb-mc-opt="{i}" aria-pressed="false">'
            f'  <span class="bb-mc__bullet" aria-hidden="true">{chr(65 + i)}</span>'
            f'  <span class="bb-mc__text">{esc(opt.text)}</span>'
            f'</button>'
        )
    html = f'''
<article class="bb-block bb-mc" id="{bid}" data-bb="multiple_choice">
  <h3 class="bb-mc__question">{esc(content.question)}</h3>
  <div class="bb-mc__opts" role="group" aria-label="Antwortoptionen">
    {''.join(opts_html)}
  </div>
  <p class="bb-mc__feedback" data-bb-mc-feedback="{bid}" aria-live="polite"></p>
  {('<aside class="bb-mc__exp" hidden data-bb-mc-exp="' + bid + '">' + esc(content.explanation) + '</aside>') if content.explanation else ''}
</article>
'''.strip()
    css = '''
.bb-mc { display: flex; flex-direction: column; gap: var(--bb-gap-sm); padding: var(--bb-gap-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); border-radius: var(--bb-radius-md); box-shadow: var(--bb-shadow-card); height: 100%; }
.bb-mc__question { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); line-height: var(--bb-line-height-tight); }
.bb-mc__opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--bb-gap-sm); }
.bb-mc__opt { display: flex; align-items: center; gap: var(--bb-gap-sm); min-height: 64px; padding: var(--bb-gap-sm) var(--bb-gap-md); border-radius: var(--bb-radius-md); border: 2px solid transparent; background: var(--bb-bg-chip); color: var(--bb-text); font-size: var(--bb-font-size-md); cursor: pointer; text-align: left; }
.bb-mc__opt:focus-visible { outline: 3px solid var(--bb-focus); outline-offset: 2px; }
.bb-mc__opt[data-bb-mc-state="correct"] { background: color-mix(in srgb, var(--bb-success) 20%, transparent); border-color: var(--bb-success); }
.bb-mc__opt[data-bb-mc-state="wrong"] { background: color-mix(in srgb, var(--bb-danger) 18%, transparent); border-color: var(--bb-danger); }
.bb-mc__bullet { width: 36px; height: 36px; border-radius: 999px; background: var(--bb-bg-card); display: flex; align-items: center; justify-content: center; font-weight: 700; }
.bb-mc__text { flex: 1 1 auto; }
.bb-mc__feedback { margin: 0; min-height: 24px; font-size: var(--bb-font-size-md); color: var(--bb-text-muted); }
.bb-mc__exp { margin: 0; padding: var(--bb-gap-sm) var(--bb-gap-md); background: var(--bb-bg-chip); border-radius: var(--bb-radius-sm); font-size: var(--bb-font-size-sm); color: var(--bb-text); }
'''
    js = '''
(function(){
  var bid = ''' + js_str(bid) + ''';
  var correct = ''' + js_str(correct_indexes) + ''';
  var fb = document.querySelector('[data-bb-mc-feedback="' + bid + '"]');
  var exp = document.querySelector('[data-bb-mc-exp="' + bid + '"]');
  var opts = document.querySelectorAll('#' + bid + ' [data-bb-mc-opt]');
  if (!opts.length || !fb) return;
  opts.forEach(function(btn){
    btn.addEventListener('click', function(){
      var idx = parseInt(btn.getAttribute('data-bb-mc-opt'), 10);
      var ok = correct.indexOf(idx) !== -1;
      btn.setAttribute('data-bb-mc-state', ok ? 'correct' : 'wrong');
      btn.setAttribute('aria-pressed', 'true');
      fb.textContent = ok ? 'Richtig!' : 'Versuche es noch einmal.';
      if (ok && exp) exp.removeAttribute('hidden');
    });
  });
})();
'''
    return {'html': html, 'css': css, 'js': js, **_empty_used()}


def render_richtig_falsch(content: RichtigFalschContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('rf', content.title or 'rf')
    rows = []
    answers: list[bool] = []
    for i, st in enumerate(content.statements):
        answers.append(bool(st.correct))
        rows.append(
            f'<li class="bb-rf__row" data-bb-rf-row="{i}">'
            f'  <span class="bb-rf__txt">{esc(st.text)}</span>'
            f'  <span class="bb-rf__btns">'
            f'    <button type="button" class="bb-rf__btn bb-rf__btn--r" data-bb-rf-pick="{i}:r">Richtig</button>'
            f'    <button type="button" class="bb-rf__btn bb-rf__btn--f" data-bb-rf-pick="{i}:f">Falsch</button>'
            f'  </span>'
            f'</li>'
        )
    html = f'''
<article class="bb-block bb-rf" id="{bid}" data-bb="richtig_falsch">
  <h3 class="bb-rf__title">{esc(content.title)}</h3>
  <ul class="bb-rf__list">{''.join(rows)}</ul>
</article>
'''.strip()
    css = '''
.bb-rf { display: flex; flex-direction: column; gap: var(--bb-gap-sm); padding: var(--bb-gap-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); border-radius: var(--bb-radius-md); box-shadow: var(--bb-shadow-card); height: 100%; overflow: hidden; }
.bb-rf__title { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); }
.bb-rf__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--bb-gap-sm); flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.bb-rf__row { display: grid; grid-template-columns: 1fr auto; gap: var(--bb-gap-sm); align-items: center; padding: var(--bb-gap-sm); background: var(--bb-bg-chip); border-radius: var(--bb-radius-sm); }
.bb-rf__row[data-bb-rf-state="correct"] { background: color-mix(in srgb, var(--bb-success) 18%, transparent); }
.bb-rf__row[data-bb-rf-state="wrong"]   { background: color-mix(in srgb, var(--bb-danger) 18%, transparent); }
.bb-rf__txt { font-size: var(--bb-font-size-md); color: var(--bb-text); }
.bb-rf__btns { display: inline-flex; gap: 8px; }
.bb-rf__btn  { min-height: var(--bb-touch-min); min-width: 80px; padding: 0 var(--bb-gap-sm); border-radius: var(--bb-radius-sm); border: 0; cursor: pointer; font-size: var(--bb-font-size-md); }
.bb-rf__btn--r { background: var(--bb-success); color: #fff; }
.bb-rf__btn--f { background: var(--bb-danger);  color: #fff; }
.bb-rf__btn:focus-visible { outline: 3px solid var(--bb-focus); outline-offset: 2px; }
'''
    js = '''
(function(){
  var bid = ''' + js_str(bid) + ''';
  var ans = ''' + js_str(answers) + ''';
  var btns = document.querySelectorAll('#' + bid + ' [data-bb-rf-pick]');
  btns.forEach(function(btn){
    btn.addEventListener('click', function(){
      var raw = btn.getAttribute('data-bb-rf-pick').split(':');
      var i = parseInt(raw[0], 10);
      var pick = raw[1] === 'r';
      var ok = pick === ans[i];
      var row = document.querySelector('#' + bid + ' [data-bb-rf-row="' + i + '"]');
      if (row) row.setAttribute('data-bb-rf-state', ok ? 'correct' : 'wrong');
    });
  });
})();
'''
    return {'html': html, 'css': css, 'js': js, **_empty_used()}


def render_sortier(content: SortierContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('so', content.title or 'so')
    correct = list(content.items)
    cards = []
    for i, item in enumerate(correct):
        cards.append(
            f'<li class="bb-so__card" data-bb-so-card="{i}">'
            f'  <button type="button" class="bb-so__pick" data-bb-so-pick="{i}" aria-pressed="false">'
            f'    <span class="bb-so__num"></span>'
            f'    <span class="bb-so__txt">{esc(item)}</span>'
            f'  </button>'
            f'</li>'
        )
    html = f'''
<article class="bb-block bb-so" id="{bid}" data-bb="sortier">
  <h3 class="bb-so__title">{esc(content.title)}</h3>
  <ol class="bb-so__list" data-bb-so-list="{bid}">{''.join(cards)}</ol>
  <div class="bb-so__actions">
    <button type="button" class="bb-btn bb-btn--ghost" data-bb-so-shuffle="{bid}">Mischen</button>
    <button type="button" class="bb-btn bb-btn--primary" data-bb-so-check="{bid}">Prüfen</button>
  </div>
  <p class="bb-so__feedback" data-bb-so-fb="{bid}" aria-live="polite"></p>
</article>
'''.strip()
    css = '''
.bb-so { display: flex; flex-direction: column; gap: var(--bb-gap-sm); padding: var(--bb-gap-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); border-radius: var(--bb-radius-md); box-shadow: var(--bb-shadow-card); height: 100%; }
.bb-so__title { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); }
.bb-so__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; overflow-y: auto; min-height: 0; }
.bb-so__card { display: block; }
.bb-so__pick { width: 100%; display: flex; align-items: center; gap: var(--bb-gap-sm); min-height: var(--bb-touch-min); padding: var(--bb-gap-sm) var(--bb-gap-md); border-radius: var(--bb-radius-sm); border: 2px solid transparent; background: var(--bb-bg-chip); color: var(--bb-text); font-size: var(--bb-font-size-md); cursor: pointer; text-align: left; }
.bb-so__pick[aria-pressed="true"] { border-color: var(--bb-primary); background: color-mix(in srgb, var(--bb-primary) 12%, var(--bb-bg-chip)); }
.bb-so__pick[data-bb-so-state="correct"] { border-color: var(--bb-success); background: color-mix(in srgb, var(--bb-success) 18%, var(--bb-bg-chip)); }
.bb-so__pick[data-bb-so-state="wrong"]   { border-color: var(--bb-danger);  background: color-mix(in srgb, var(--bb-danger) 18%, var(--bb-bg-chip)); }
.bb-so__num { min-width: 28px; font-weight: 700; color: var(--bb-text-muted); font-variant-numeric: tabular-nums; }
.bb-so__actions { display: flex; gap: var(--bb-gap-sm); }
.bb-so__feedback { margin: 0; min-height: 22px; font-size: var(--bb-font-size-sm); color: var(--bb-text-muted); }
'''
    js = '''
(function(){
  var bid = ''' + js_str(bid) + ''';
  var correct = ''' + js_str(correct) + ''';
  var list = document.querySelector('[data-bb-so-list="' + bid + '"]');
  var fb = document.querySelector('[data-bb-so-fb="' + bid + '"]');
  if (!list || !fb) return;
  function order(){ return Array.prototype.map.call(list.children, function(li){ return li.querySelector('.bb-so__txt').textContent; }); }
  function refreshNumbers(){ Array.prototype.forEach.call(list.children, function(li, i){ var n = li.querySelector('.bb-so__num'); if (n) n.textContent = (i + 1) + '.'; }); }
  function clearStates(){ Array.prototype.forEach.call(list.querySelectorAll('.bb-so__pick'), function(b){ b.removeAttribute('data-bb-so-state'); b.setAttribute('aria-pressed','false'); }); }
  function shuffle(){ var arr = Array.prototype.slice.call(list.children); for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); list.insertBefore(arr[j], arr[i]); var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; } refreshNumbers(); clearStates(); fb.textContent=''; }
  var pickedIdx = -1;
  Array.prototype.forEach.call(list.querySelectorAll('.bb-so__pick'), function(btn){
    btn.addEventListener('click', function(){
      var li = btn.closest('.bb-so__card');
      var siblings = Array.prototype.slice.call(list.children);
      var pos = siblings.indexOf(li);
      if (pickedIdx === -1) { pickedIdx = pos; btn.setAttribute('aria-pressed','true'); return; }
      if (pickedIdx === pos) { btn.setAttribute('aria-pressed','false'); pickedIdx = -1; return; }
      var a = list.children[pickedIdx], b = list.children[pos];
      var marker = document.createComment('m');
      list.insertBefore(marker, a); list.insertBefore(a, b); list.insertBefore(b, marker); list.removeChild(marker);
      pickedIdx = -1; clearStates(); refreshNumbers();
    });
  });
  document.querySelector('[data-bb-so-shuffle="' + bid + '"]').addEventListener('click', shuffle);
  document.querySelector('[data-bb-so-check="' + bid + '"]').addEventListener('click', function(){
    var cur = order();
    var allOk = cur.length === correct.length && cur.every(function(x, i){ return x === correct[i]; });
    Array.prototype.forEach.call(list.querySelectorAll('.bb-so__pick'), function(btn, i){
      btn.setAttribute('data-bb-so-state', cur[i] === correct[i] ? 'correct' : 'wrong');
    });
    fb.textContent = allOk ? 'Reihenfolge stimmt!' : 'Noch nicht ganz richtig — versuche es weiter.';
  });
  shuffle();
})();
'''
    return {'html': html, 'css': css, 'js': js, **_empty_used()}


def render_zuordnung(content: ZuordnungContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('zo', content.title or 'zo')
    lefts: list[str] = [p.left for p in content.pairs]
    rights: list[str] = [p.right for p in content.pairs]
    left_html = ''.join(
        f'<button type="button" class="bb-zo__btn bb-zo__btn--l" data-bb-zo-left="{i}" aria-pressed="false">{esc(lefts[i])}</button>'
        for i in range(len(lefts))
    )
    right_html = ''.join(
        f'<button type="button" class="bb-zo__btn bb-zo__btn--r" data-bb-zo-right="{i}" aria-pressed="false">{esc(rights[i])}</button>'
        for i in range(len(rights))
    )
    html = f'''
<article class="bb-block bb-zo" id="{bid}" data-bb="zuordnung">
  <h3 class="bb-zo__title">{esc(content.title)}</h3>
  <div class="bb-zo__cols">
    <div class="bb-zo__col">{left_html}</div>
    <div class="bb-zo__col">{right_html}</div>
  </div>
  <p class="bb-zo__fb" data-bb-zo-fb="{bid}" aria-live="polite"></p>
</article>
'''.strip()
    css = '''
.bb-zo { display: flex; flex-direction: column; gap: var(--bb-gap-sm); padding: var(--bb-gap-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); border-radius: var(--bb-radius-md); box-shadow: var(--bb-shadow-card); height: 100%; }
.bb-zo__title { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); }
.bb-zo__cols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--bb-gap-sm); flex: 1 1 auto; min-height: 0; }
.bb-zo__col { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow-y: auto; }
.bb-zo__btn { min-height: var(--bb-touch-min); padding: var(--bb-gap-sm) var(--bb-gap-md); border-radius: var(--bb-radius-sm); border: 2px solid transparent; background: var(--bb-bg-chip); font-size: var(--bb-font-size-md); color: var(--bb-text); cursor: pointer; text-align: left; }
.bb-zo__btn[aria-pressed="true"] { border-color: var(--bb-primary); background: color-mix(in srgb, var(--bb-primary) 14%, var(--bb-bg-chip)); }
.bb-zo__btn[data-bb-zo-state="ok"]   { border-color: var(--bb-success); background: color-mix(in srgb, var(--bb-success) 18%, var(--bb-bg-chip)); }
.bb-zo__btn[data-bb-zo-state="bad"]  { border-color: var(--bb-danger);  background: color-mix(in srgb, var(--bb-danger) 18%, var(--bb-bg-chip)); }
.bb-zo__fb { margin: 0; font-size: var(--bb-font-size-sm); color: var(--bb-text-muted); min-height: 22px; }
'''
    js = '''
(function(){
  var bid = ''' + js_str(bid) + ''';
  var fb = document.querySelector('[data-bb-zo-fb="' + bid + '"]');
  var lefts = document.querySelectorAll('#' + bid + ' [data-bb-zo-left]');
  var rights = document.querySelectorAll('#' + bid + ' [data-bb-zo-right]');
  if (!fb || !lefts.length || !rights.length) return;
  var pickedLeft = -1;
  var solved = 0;
  function reset(b){ b.setAttribute('aria-pressed','false'); }
  Array.prototype.forEach.call(lefts, function(btn){
    btn.addEventListener('click', function(){
      if (btn.getAttribute('data-bb-zo-state') === 'ok') return;
      Array.prototype.forEach.call(lefts, reset);
      btn.setAttribute('aria-pressed','true');
      pickedLeft = parseInt(btn.getAttribute('data-bb-zo-left'), 10);
    });
  });
  Array.prototype.forEach.call(rights, function(btn){
    btn.addEventListener('click', function(){
      if (pickedLeft === -1 || btn.getAttribute('data-bb-zo-state') === 'ok') return;
      var idx = parseInt(btn.getAttribute('data-bb-zo-right'), 10);
      var leftBtn = document.querySelector('#' + bid + ' [data-bb-zo-left="' + pickedLeft + '"]');
      if (idx === pickedLeft) {
        btn.setAttribute('data-bb-zo-state','ok'); btn.disabled = true;
        if (leftBtn) { leftBtn.setAttribute('data-bb-zo-state','ok'); leftBtn.disabled = true; }
        solved += 1;
        fb.textContent = (solved === lefts.length) ? 'Alles richtig zugeordnet!' : 'Richtig — weiter so.';
      } else {
        btn.setAttribute('data-bb-zo-state','bad');
        if (leftBtn) leftBtn.setAttribute('data-bb-zo-state','bad');
        fb.textContent = 'Nicht ganz, probiere noch einmal.';
        setTimeout(function(){
          btn.removeAttribute('data-bb-zo-state');
          if (leftBtn) leftBtn.removeAttribute('data-bb-zo-state');
        }, 600);
      }
      Array.prototype.forEach.call(lefts, reset);
      pickedLeft = -1;
    });
  });
})();
'''
    return {'html': html, 'css': css, 'js': js, **_empty_used()}


def render_lueckentext(content: LueckentextContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('lt', content.title or 'lt')
    sentences_html = []
    answers: list[str] = []
    for i, s in enumerate(content.sentences):
        answers.append(s.answer)
        parts = s.text.split('___')
        gap = f'<button type="button" class="bb-lt__gap" data-bb-lt-gap="{i}" aria-label="Lücke {i + 1}">…</button>'
        merged = (parts[0] if parts else '')
        rest = parts[1:] if len(parts) > 1 else []
        sentence_html = esc(merged) + gap + esc(' '.join(rest))
        sentences_html.append(f'<li class="bb-lt__sentence">{sentence_html}</li>')
    words_pool = [a for a in answers] + [w for w in content.extra_words if w]
    words_unique: list[str] = []
    for w in words_pool:
        if w not in words_unique:
            words_unique.append(w)
    words_html = ''.join(
        f'<button type="button" class="bb-lt__word" data-bb-lt-word="{esc(w)}">{esc(w)}</button>'
        for w in words_unique
    )
    html = f'''
<article class="bb-block bb-lt" id="{bid}" data-bb="lueckentext">
  <h3 class="bb-lt__title">{esc(content.title)}</h3>
  <ul class="bb-lt__list">{''.join(sentences_html)}</ul>
  <div class="bb-lt__words" role="group" aria-label="Wortkarten">{words_html}</div>
  <p class="bb-lt__fb" data-bb-lt-fb="{bid}" aria-live="polite"></p>
</article>
'''.strip()
    css = '''
.bb-lt { display: flex; flex-direction: column; gap: var(--bb-gap-sm); padding: var(--bb-gap-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); border-radius: var(--bb-radius-md); box-shadow: var(--bb-shadow-card); height: 100%; }
.bb-lt__title { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); }
.bb-lt__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--bb-gap-sm); }
.bb-lt__sentence { font-size: var(--bb-font-size-md); line-height: var(--bb-line-height-normal); color: var(--bb-text); }
.bb-lt__gap { display: inline-flex; align-items: center; min-height: 36px; min-width: 90px; padding: 2px 12px; margin: 0 4px; border: 2px dashed var(--bb-text-muted); border-radius: var(--bb-radius-sm); background: var(--bb-bg-chip); color: var(--bb-text); font-size: var(--bb-font-size-md); cursor: pointer; }
.bb-lt__gap[data-bb-lt-state="ok"]  { border-style: solid; border-color: var(--bb-success); background: color-mix(in srgb, var(--bb-success) 18%, var(--bb-bg-chip)); }
.bb-lt__gap[data-bb-lt-state="bad"] { border-style: solid; border-color: var(--bb-danger);  background: color-mix(in srgb, var(--bb-danger)  18%, var(--bb-bg-chip)); }
.bb-lt__words { display: flex; flex-wrap: wrap; gap: 8px; margin-top: var(--bb-gap-sm); }
.bb-lt__word  { min-height: var(--bb-touch-min); padding: 0 var(--bb-gap-md); border-radius: var(--bb-radius-sm); border: 0; background: var(--bb-primary); color: var(--bb-primary-text); font-size: var(--bb-font-size-md); cursor: pointer; }
.bb-lt__word[aria-pressed="true"] { outline: 3px solid var(--bb-focus); outline-offset: 2px; }
.bb-lt__fb { margin: 0; min-height: 22px; font-size: var(--bb-font-size-sm); color: var(--bb-text-muted); }
'''
    js = '''
(function(){
  var bid = ''' + js_str(bid) + ''';
  var answers = ''' + js_str(answers) + ''';
  var fb = document.querySelector('[data-bb-lt-fb="' + bid + '"]');
  var words = document.querySelectorAll('#' + bid + ' [data-bb-lt-word]');
  var gaps = document.querySelectorAll('#' + bid + ' [data-bb-lt-gap]');
  if (!fb || !words.length || !gaps.length) return;
  var picked = '';
  Array.prototype.forEach.call(words, function(b){
    b.addEventListener('click', function(){
      Array.prototype.forEach.call(words, function(x){ x.setAttribute('aria-pressed','false'); });
      b.setAttribute('aria-pressed','true');
      picked = b.getAttribute('data-bb-lt-word');
    });
  });
  Array.prototype.forEach.call(gaps, function(g){
    g.addEventListener('click', function(){
      if (!picked) return;
      var i = parseInt(g.getAttribute('data-bb-lt-gap'), 10);
      g.textContent = picked;
      var ok = picked === answers[i];
      g.setAttribute('data-bb-lt-state', ok ? 'ok' : 'bad');
      fb.textContent = ok ? 'Passt!' : 'Noch nicht — probier ein anderes Wort.';
      Array.prototype.forEach.call(words, function(x){ x.setAttribute('aria-pressed','false'); });
      picked = '';
    });
  });
})();
'''
    return {'html': html, 'css': css, 'js': js, **_empty_used()}


def render_wortarten(content: WortartenContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('wa', content.title or 'wa')
    words = content.sentence.split()
    word_pieces = []
    solution_list: list[str] = []
    for i, w in enumerate(words):
        clean_word = w.strip(',.;:!?')
        tag = content.solution.get(clean_word, 'sonstiges')
        solution_list.append(tag)
        word_pieces.append(
            f'<button type="button" class="bb-wa__word" data-bb-wa-word="{i}" data-bb-wa-tag="">{esc(w)}</button>'
        )
    html = f'''
<article class="bb-block bb-wa" id="{bid}" data-bb="wortarten">
  <h3 class="bb-wa__title">{esc(content.title)}</h3>
  <div class="bb-wa__sentence">{''.join(word_pieces)}</div>
  <div class="bb-wa__legend" role="group" aria-label="Wortart wählen">
    <button type="button" class="bb-wa__tag bb-wa__tag--nomen"     data-bb-wa-pick="nomen">Nomen</button>
    <button type="button" class="bb-wa__tag bb-wa__tag--verb"      data-bb-wa-pick="verb">Verb</button>
    <button type="button" class="bb-wa__tag bb-wa__tag--adjektiv"  data-bb-wa-pick="adjektiv">Adjektiv</button>
    <button type="button" class="bb-wa__tag bb-wa__tag--reset"     data-bb-wa-pick="">Zurücksetzen</button>
  </div>
  <button type="button" class="bb-btn bb-btn--primary" data-bb-wa-check="{bid}">Prüfen</button>
  <p class="bb-wa__fb" data-bb-wa-fb="{bid}" aria-live="polite"></p>
</article>
'''.strip()
    css = '''
.bb-wa { display: flex; flex-direction: column; gap: var(--bb-gap-sm); padding: var(--bb-gap-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); border-radius: var(--bb-radius-md); box-shadow: var(--bb-shadow-card); height: 100%; }
.bb-wa__title { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); }
.bb-wa__sentence { display: flex; flex-wrap: wrap; gap: 8px; }
.bb-wa__word { min-height: 44px; padding: 4px 10px; border-radius: var(--bb-radius-sm); border: 2px solid transparent; background: var(--bb-bg-chip); color: var(--bb-text); font-size: var(--bb-font-size-md); cursor: pointer; }
.bb-wa__word[data-bb-wa-tag="nomen"]    { background: color-mix(in srgb, #2563EB 22%, var(--bb-bg-chip)); border-color: #2563EB; }
.bb-wa__word[data-bb-wa-tag="verb"]     { background: color-mix(in srgb, #DC2626 22%, var(--bb-bg-chip)); border-color: #DC2626; }
.bb-wa__word[data-bb-wa-tag="adjektiv"] { background: color-mix(in srgb, #16A34A 22%, var(--bb-bg-chip)); border-color: #16A34A; }
.bb-wa__word[data-bb-wa-state="ok"]  { box-shadow: inset 0 0 0 2px var(--bb-success); }
.bb-wa__word[data-bb-wa-state="bad"] { box-shadow: inset 0 0 0 2px var(--bb-danger); }
.bb-wa__legend { display: flex; flex-wrap: wrap; gap: 8px; }
.bb-wa__tag { min-height: var(--bb-touch-min); padding: 0 var(--bb-gap-md); border-radius: var(--bb-radius-sm); border: 0; cursor: pointer; font-size: var(--bb-font-size-md); color: #fff; }
.bb-wa__tag--nomen    { background: #2563EB; }
.bb-wa__tag--verb     { background: #DC2626; }
.bb-wa__tag--adjektiv { background: #16A34A; }
.bb-wa__tag--reset    { background: var(--bb-text-muted); }
.bb-wa__tag[aria-pressed="true"] { outline: 3px solid var(--bb-focus); outline-offset: 2px; }
.bb-wa__fb { margin: 0; min-height: 22px; font-size: var(--bb-font-size-sm); color: var(--bb-text-muted); }
'''
    js = '''
(function(){
  var bid = ''' + js_str(bid) + ''';
  var solution = ''' + js_str(solution_list) + ''';
  var current = '';
  var legend = document.querySelectorAll('#' + bid + ' [data-bb-wa-pick]');
  var words = document.querySelectorAll('#' + bid + ' [data-bb-wa-word]');
  var fb = document.querySelector('[data-bb-wa-fb="' + bid + '"]');
  var check = document.querySelector('[data-bb-wa-check="' + bid + '"]');
  Array.prototype.forEach.call(legend, function(b){
    b.addEventListener('click', function(){
      Array.prototype.forEach.call(legend, function(x){ x.setAttribute('aria-pressed','false'); });
      b.setAttribute('aria-pressed','true');
      current = b.getAttribute('data-bb-wa-pick');
    });
  });
  Array.prototype.forEach.call(words, function(w){
    w.addEventListener('click', function(){
      if (current === '') { w.setAttribute('data-bb-wa-tag',''); w.removeAttribute('data-bb-wa-state'); return; }
      w.setAttribute('data-bb-wa-tag', current);
      w.removeAttribute('data-bb-wa-state');
    });
  });
  if (check && fb) check.addEventListener('click', function(){
    var ok = 0, total = solution.length;
    Array.prototype.forEach.call(words, function(w, i){
      var tag = w.getAttribute('data-bb-wa-tag') || '';
      var ex = solution[i] || 'sonstiges';
      if (ex === 'sonstiges' && tag === '') { ok += 1; w.removeAttribute('data-bb-wa-state'); return; }
      if (tag === ex) { w.setAttribute('data-bb-wa-state','ok'); ok += 1; }
      else { w.setAttribute('data-bb-wa-state','bad'); }
    });
    fb.textContent = 'Treffer: ' + ok + ' / ' + total;
  });
})();
'''
    return {'html': html, 'css': css, 'js': js, **_empty_used()}


def render_pro_contra(content: ProContraContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('pc', content.title or 'pc')
    args_html = []
    sides: list[str] = []
    for i, a in enumerate(content.arguments):
        sides.append(a.side)
        args_html.append(
            f'<button type="button" class="bb-pc__arg" data-bb-pc-arg="{i}" data-bb-pc-side="" aria-label="Argument {i + 1}">'
            f'{esc(a.text)}</button>'
        )
    html = f'''
<article class="bb-block bb-pc" id="{bid}" data-bb="pro_contra">
  <h3 class="bb-pc__title">{esc(content.title)}</h3>
  <div class="bb-pc__cols">
    <div class="bb-pc__col bb-pc__col--pro" data-bb-pc-drop="pro" aria-label="Pro-Argumente"><span class="bb-pc__h">PRO</span></div>
    <div class="bb-pc__pool" data-bb-pc-pool="{bid}">{''.join(args_html)}</div>
    <div class="bb-pc__col bb-pc__col--contra" data-bb-pc-drop="contra" aria-label="Contra-Argumente"><span class="bb-pc__h">CONTRA</span></div>
  </div>
  <div class="bb-pc__actions">
    <button type="button" class="bb-btn bb-btn--ghost" data-bb-pc-reset="{bid}">Zurücksetzen</button>
    <button type="button" class="bb-btn bb-btn--primary" data-bb-pc-check="{bid}">Prüfen</button>
  </div>
  <p class="bb-pc__fb" data-bb-pc-fb="{bid}" aria-live="polite"></p>
</article>
'''.strip()
    css = '''
.bb-pc { display: flex; flex-direction: column; gap: var(--bb-gap-sm); padding: var(--bb-gap-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); border-radius: var(--bb-radius-md); box-shadow: var(--bb-shadow-card); height: 100%; }
.bb-pc__title { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); }
.bb-pc__cols { display: grid; grid-template-columns: 1fr 1.4fr 1fr; gap: var(--bb-gap-sm); flex: 1 1 auto; min-height: 0; }
.bb-pc__col { display: flex; flex-direction: column; gap: 8px; padding: 8px; border-radius: var(--bb-radius-sm); background: var(--bb-bg-chip); min-height: 0; overflow-y: auto; }
.bb-pc__col--pro    { background: color-mix(in srgb, var(--bb-success) 12%, var(--bb-bg-chip)); }
.bb-pc__col--contra { background: color-mix(in srgb, var(--bb-danger)  12%, var(--bb-bg-chip)); }
.bb-pc__h  { font-size: var(--bb-font-size-sm); font-weight: 700; letter-spacing: .08em; color: var(--bb-text-muted); align-self: flex-start; }
.bb-pc__pool { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow-y: auto; }
.bb-pc__arg { min-height: var(--bb-touch-min); padding: var(--bb-gap-sm); border-radius: var(--bb-radius-sm); border: 0; cursor: pointer; font-size: var(--bb-font-size-md); background: var(--bb-bg-card); color: var(--bb-text); border: var(--bb-border-subtle); text-align: left; }
.bb-pc__arg[data-bb-pc-state="ok"]  { box-shadow: inset 0 0 0 2px var(--bb-success); }
.bb-pc__arg[data-bb-pc-state="bad"] { box-shadow: inset 0 0 0 2px var(--bb-danger); }
.bb-pc__actions { display: flex; gap: var(--bb-gap-sm); }
.bb-pc__fb { margin: 0; min-height: 22px; font-size: var(--bb-font-size-sm); color: var(--bb-text-muted); }
'''
    js = '''
(function(){
  var bid = ''' + js_str(bid) + ''';
  var sides = ''' + js_str(sides) + ''';
  var pool = document.querySelector('[data-bb-pc-pool="' + bid + '"]');
  var pro = document.querySelector('#' + bid + ' [data-bb-pc-drop="pro"]');
  var con = document.querySelector('#' + bid + ' [data-bb-pc-drop="contra"]');
  var fb = document.querySelector('[data-bb-pc-fb="' + bid + '"]');
  var reset = document.querySelector('[data-bb-pc-reset="' + bid + '"]');
  var check = document.querySelector('[data-bb-pc-check="' + bid + '"]');
  if (!pool || !pro || !con || !fb) return;
  var picked = null;
  function bind(btn){
    btn.addEventListener('click', function(){
      if (picked === btn) { picked = null; btn.style.outline=''; return; }
      if (picked) picked.style.outline='';
      picked = btn; btn.style.outline = '3px solid var(--bb-focus)';
    });
  }
  Array.prototype.forEach.call(pool.querySelectorAll('.bb-pc__arg'), bind);
  function move(target, side){
    target.addEventListener('click', function(){
      if (!picked) return;
      picked.setAttribute('data-bb-pc-side', side);
      picked.style.outline='';
      target.appendChild(picked);
      picked = null;
    });
  }
  move(pro, 'pro'); move(con, 'contra');
  reset.addEventListener('click', function(){
    Array.prototype.forEach.call(document.querySelectorAll('#' + bid + ' .bb-pc__arg'), function(b){
      b.removeAttribute('data-bb-pc-state'); b.removeAttribute('data-bb-pc-side'); b.style.outline='';
      pool.appendChild(b);
    });
    fb.textContent='';
  });
  check.addEventListener('click', function(){
    var args = document.querySelectorAll('#' + bid + ' .bb-pc__arg');
    var ok = 0;
    Array.prototype.forEach.call(args, function(b, i){
      var s = b.getAttribute('data-bb-pc-side') || '';
      if (s === sides[i]) { b.setAttribute('data-bb-pc-state','ok'); ok += 1; }
      else if (s) { b.setAttribute('data-bb-pc-state','bad'); }
      else { b.removeAttribute('data-bb-pc-state'); }
    });
    fb.textContent = 'Richtig sortiert: ' + ok + ' / ' + sides.length;
  });
})();
'''
    return {'html': html, 'css': css, 'js': js, **_empty_used()}
