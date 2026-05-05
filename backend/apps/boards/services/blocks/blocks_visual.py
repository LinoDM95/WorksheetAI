"""Visual-Bausteine: Diagramme via Chart.js (Canvas) und Zahlenstrahl via D3."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

from ._helpers import block_id, esc, js_str
from .themes import Theme


class ChartEntry(BaseModel):
    label: str = Field(default='', max_length=40)
    value: float = 0.0


class _BaseChart(BaseModel):
    title: str = Field(default='', max_length=160)
    x_label: str = Field(default='', max_length=80)
    y_label: str = Field(default='', max_length=80)
    entries: list[ChartEntry] = Field(default_factory=list)

    @field_validator('entries')
    @classmethod
    def _limit(cls, v: list[ChartEntry]) -> list[ChartEntry]:
        if not 2 <= len(v) <= 12:
            raise ValueError('Brauche 2–12 Datenpunkte')
        return v


class BalkenChartContent(_BaseChart):
    pass


class LinienChartContent(_BaseChart):
    pass


def _chart_html(bid: str, content: _BaseChart) -> str:
    return f'''
<article class="bb-block bb-chart" id="{bid}" data-bb="chart">
  <h3 class="bb-chart__title">{esc(content.title)}</h3>
  <div class="bb-chart__canvas"><canvas id="{bid}-c" aria-label="Diagramm"></canvas></div>
</article>
'''.strip()


_CHART_CSS = '''
.bb-chart { display: flex; flex-direction: column; gap: var(--bb-gap-sm); padding: var(--bb-gap-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); border-radius: var(--bb-radius-md); box-shadow: var(--bb-shadow-card); height: 100%; }
.bb-chart__title { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); }
.bb-chart__canvas { position: relative; flex: 1 1 auto; min-height: 0; }
.bb-chart__canvas > canvas { width: 100% !important; height: 100% !important; }
'''


def _chart_js(bid: str, content: _BaseChart, *, kind: str) -> str:
    labels = [e.label for e in content.entries]
    data = [e.value for e in content.entries]
    return '''
(function(){
  if (!window.Chart) return;
  var el = document.getElementById(''' + js_str(bid + '-c') + ''');
  if (!el) return;
  var ctx = el.getContext('2d');
  new window.Chart(ctx, {
    type: ''' + js_str(kind) + ''',
    data: {
      labels: ''' + js_str(labels) + ''',
      datasets: [{
        label: ''' + js_str(content.y_label or 'Wert') + ''',
        data: ''' + js_str(data) + ''',
        backgroundColor: ''' + ('"rgba(79,70,229,0.65)"' if kind == 'bar' else '"rgba(79,70,229,0.15)"') + ''',
        borderColor: "rgba(79,70,229,1)",
        borderWidth: 2,
        tension: 0.25,
        fill: ''' + ('false' if kind == 'bar' else 'true') + '''
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: { display: false },
        title: { display: false }
      },
      scales: {
        x: { title: { display: !!''' + js_str(content.x_label) + ''', text: ''' + js_str(content.x_label) + ''' }, ticks: { font: { size: 14 } } },
        y: { title: { display: !!''' + js_str(content.y_label) + ''', text: ''' + js_str(content.y_label) + ''' }, beginAtZero: true, ticks: { font: { size: 14 } } }
      }
    }
  });
})();
'''


def render_balken_chart(content: BalkenChartContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('bc', content.title or 'bc')
    return {
        'html': _chart_html(bid, content),
        'css': _CHART_CSS,
        'js': _chart_js(bid, content, kind='bar'),
        'used_libraries': ['chartjs'],
        'used_assets': [],
        'used_datasets': [],
    }


def render_linien_chart(content: LinienChartContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('lc', content.title or 'lc')
    return {
        'html': _chart_html(bid, content),
        'css': _CHART_CSS,
        'js': _chart_js(bid, content, kind='line'),
        'used_libraries': ['chartjs'],
        'used_assets': [],
        'used_datasets': [],
    }


# ---------------------------------------------------------------------------
# Zahlenstrahl (D3, deterministisch)
# ---------------------------------------------------------------------------
class ZahlenstrahlContent(BaseModel):
    title: str = Field(default='', max_length=160)
    min: float = 0
    max: float = 100
    step: float = 1
    target: float | None = None
    show_target: bool = False
    markers: list[float] = Field(default_factory=list)

    @field_validator('max')
    @classmethod
    def _max_gt_min(cls, v: float, info) -> float:
        m = info.data.get('min', 0)
        if v <= m:
            raise ValueError('max muss > min sein')
        return v

    @field_validator('step')
    @classmethod
    def _positive_step(cls, v: float) -> float:
        if v <= 0:
            raise ValueError('step muss > 0 sein')
        return v


def render_zahlenstrahl(content: ZahlenstrahlContent, theme: Theme) -> dict[str, Any]:
    bid = block_id('zs', content.title or 'zs')
    html = f'''
<article class="bb-block bb-zs" id="{bid}" data-bb="zahlenstrahl">
  <h3 class="bb-zs__title">{esc(content.title)}</h3>
  <div class="bb-zs__svg" data-bb-zs-svg="{bid}" aria-label="Zahlenstrahl-Visualisierung"></div>
  <label class="bb-zs__ctrl">
    <span class="bb-zs__lbl">Wert</span>
    <input type="range" class="bb-zs__range" data-bb-zs-range="{bid}"
           min="{content.min}" max="{content.max}" step="{content.step}"
           value="{(content.min + content.max) / 2}" />
    <output class="bb-zs__out" data-bb-zs-out="{bid}">{(content.min + content.max) / 2:g}</output>
  </label>
  {('<button type="button" class="bb-btn bb-btn--ghost" data-bb-zs-toggle="' + bid + '">Ziel anzeigen</button>') if (content.target is not None) else ''}
</article>
'''.strip()
    css = '''
.bb-zs { display: flex; flex-direction: column; gap: var(--bb-gap-sm); padding: var(--bb-gap-md); background: var(--bb-bg-card); border: var(--bb-border-subtle); border-radius: var(--bb-radius-md); box-shadow: var(--bb-shadow-card); height: 100%; }
.bb-zs__title { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); }
.bb-zs__svg { width: 100%; height: 140px; }
.bb-zs__svg svg { width: 100%; height: 100%; display: block; }
.bb-zs__ctrl { display: grid; grid-template-columns: auto 1fr auto; gap: var(--bb-gap-sm); align-items: center; }
.bb-zs__lbl { font-size: var(--bb-font-size-md); color: var(--bb-text); }
.bb-zs__out { font-size: var(--bb-font-size-lg); font-variant-numeric: tabular-nums; min-width: 60px; text-align: right; color: var(--bb-text); }
.bb-zs__range { -webkit-appearance: none; appearance: none; width: 100%; height: 8px; background: var(--bb-bg-chip); border-radius: 4px; }
.bb-zs__range::-webkit-slider-thumb { -webkit-appearance: none; width: 32px; height: 32px; border-radius: 50%; background: var(--bb-primary); border: 0; cursor: pointer; }
.bb-zs__range::-moz-range-thumb { width: 32px; height: 32px; border-radius: 50%; background: var(--bb-primary); border: 0; cursor: pointer; }
'''
    js = '''
(function(){
  if (!window.d3) return;
  var bid = ''' + js_str(bid) + ''';
  var min = ''' + str(float(content.min)) + ''';
  var max = ''' + str(float(content.max)) + ''';
  var target = ''' + (str(float(content.target)) if content.target is not None else 'null') + ''';
  var markers = ''' + js_str(list(content.markers)) + ''';
  var showTarget = ''' + ('true' if content.show_target else 'false') + ''';
  var host = document.querySelector('[data-bb-zs-svg="' + bid + '"]');
  var range = document.querySelector('[data-bb-zs-range="' + bid + '"]');
  var out = document.querySelector('[data-bb-zs-out="' + bid + '"]');
  var toggle = document.querySelector('[data-bb-zs-toggle="' + bid + '"]');
  if (!host || !range || !out) return;
  var W = host.clientWidth || 600;
  var H = host.clientHeight || 140;
  var pad = 28;
  var x = window.d3.scaleLinear().domain([min, max]).range([pad, W - pad]);
  var svg = window.d3.select(host).append('svg').attr('viewBox', '0 0 ' + W + ' ' + H).attr('preserveAspectRatio', 'xMidYMid meet');
  svg.append('line').attr('x1', pad).attr('x2', W - pad).attr('y1', H/2).attr('y2', H/2)
    .attr('stroke', 'currentColor').attr('stroke-width', 3);
  markers.forEach(function(m){
    svg.append('line').attr('x1', x(m)).attr('x2', x(m)).attr('y1', H/2 - 10).attr('y2', H/2 + 10).attr('stroke', 'currentColor').attr('stroke-width', 2);
    svg.append('text').attr('x', x(m)).attr('y', H/2 + 28).attr('text-anchor', 'middle').attr('font-size', 14).text(m);
  });
  var marker = svg.append('circle').attr('cy', H/2).attr('r', 12).attr('fill', 'var(--bb-primary)').attr('stroke', 'var(--bb-primary-text)').attr('stroke-width', 2);
  var targetMark = (target !== null) ? svg.append('polygon').attr('points', '0,-22 -10,-2 10,-2').attr('fill', 'var(--bb-success)').attr('opacity', showTarget ? 1 : 0).attr('transform', 'translate(' + x(target) + ',' + (H/2) + ')') : null;
  function update(){
    var v = parseFloat(range.value);
    if (isNaN(v)) v = (min + max) / 2;
    marker.attr('cx', x(v));
    out.textContent = v;
  }
  range.addEventListener('input', update);
  if (toggle && targetMark) toggle.addEventListener('click', function(){
    var current = parseFloat(targetMark.attr('opacity')) || 0;
    targetMark.attr('opacity', current ? 0 : 1);
    toggle.textContent = current ? 'Ziel anzeigen' : 'Ziel verbergen';
  });
  update();
})();
'''
    return {'html': html, 'css': css, 'js': js, 'used_libraries': ['d3'], 'used_assets': [], 'used_datasets': []}
