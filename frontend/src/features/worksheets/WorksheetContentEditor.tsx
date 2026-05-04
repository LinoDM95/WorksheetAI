import type { ChangeEvent, ReactNode } from 'react';

const MAX_ANSWER_LINES = 48;

export function normalizeContentForEdit(c: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!c || typeof c !== 'object') {
    return { title: '', subtitle: '', pages: [{ page_label: '', blocks: [] }], solutions: [] };
  }
  const out = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
  const blocks = out.blocks as unknown[] | undefined;
  const pages = out.pages as { page_label?: string; blocks: unknown[] }[] | undefined;
  if ((!pages || pages.length === 0) && blocks?.length) {
    out.pages = [{ page_label: '', blocks: [...blocks] }];
  }
  if (!out.pages || !Array.isArray(out.pages) || out.pages.length === 0) {
    out.pages = [{ page_label: '', blocks: [] }];
  }
  if (!Array.isArray(out.solutions)) out.solutions = [];
  return out;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function BlockEditor({
  block,
  onChange,
}: {
  block: Record<string, unknown>;
  onChange: (b: Record<string, unknown>) => void;
}) {
  const patch = (p: Record<string, unknown>) => onChange({ ...block, ...p });
  const t = String(block.type || 'text');

  if (t === 'text') {
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Text</span>
        <Field label="Überschrift">
          <input
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={String(block.title ?? '')}
            onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ title: e.target.value })}
          />
        </Field>
        <Field label="Inhalt (LaTeX: $…$ inline, \\[ … \\] abgesetzt — wird mit KaTeX gesetzt)">
          <textarea
            className="min-h-[120px] w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
            value={String(block.content ?? '')}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch({ content: e.target.value })}
          />
        </Field>
      </div>
    );
  }

  if (t === 'task_grid') {
    const items = (block.items as Record<string, unknown>[]) || [];
    const setItems = (next: Record<string, unknown>[]) => patch({ items: next });
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Aufgaben-Raster</span>
        <Field label="Block-Titel">
          <input
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={String(block.title ?? '')}
            onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ title: e.target.value })}
          />
        </Field>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[4rem_1fr_6rem] gap-2">
              <input
                className="rounded border border-slate-300 px-1 py-1 text-sm"
                value={String(it.label ?? '')}
                onChange={(e) => {
                  const n = [...items];
                  n[i] = { ...it, label: e.target.value };
                  setItems(n);
                }}
              />
              <input
                className="rounded border border-slate-300 px-2 py-1 text-sm"
                value={String(it.text ?? '')}
                onChange={(e) => {
                  const n = [...items];
                  n[i] = { ...it, text: e.target.value };
                  setItems(n);
                }}
              />
              <input
                className="rounded border border-slate-300 px-1 py-1 text-sm"
                value={String(it.answer ?? '')}
                onChange={(e) => {
                  const n = [...items];
                  n[i] = { ...it, answer: e.target.value };
                  setItems(n);
                }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (t === 'task_list') {
    const items = (block.items as Record<string, unknown>[]) || [];
    const setItems = (next: Record<string, unknown>[]) => patch({ items: next });
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Aufgaben-Liste</span>
        <Field label="Überschrift">
          <input
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={String(block.title ?? '')}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </Field>
        {items.map((it, i) => (
          <div key={i} className="rounded border border-slate-200/80 bg-white/90 p-2">
            <textarea
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              rows={2}
              value={String((it as { text?: string }).text ?? '')}
              onChange={(e) => {
                const n = [...items];
                n[i] = { ...it, text: e.target.value };
                setItems(n);
              }}
            />
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <span className="shrink-0">Linien darunter</span>
              <input
                type="number"
                min={0}
                max={MAX_ANSWER_LINES}
                className="w-16 rounded border border-slate-300 px-1 py-0.5"
                value={
                  (it as { answer_lines?: number }).answer_lines === undefined
                    ? ''
                    : String((it as { answer_lines?: number }).answer_lines)
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = [...items];
                  if (raw === '') {
                    const { answer_lines: _a, ...rest } = it as Record<string, unknown>;
                    n[i] = rest;
                  } else {
                    n[i] = { ...it, answer_lines: Math.min(MAX_ANSWER_LINES, Math.max(0, Number(raw) || 0)) };
                  }
                  setItems(n);
                }}
              />
              <span className="text-slate-400">0 = keine</span>
            </label>
          </div>
        ))}
      </div>
    );
  }

  if (t === 'checklist') {
    const items = (block.items as Record<string, unknown>[]) || [];
    const setItems = (next: Record<string, unknown>[]) => patch({ items: next });
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Checkliste</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          value={String(block.title ?? '')}
          onChange={(e) => patch({ title: e.target.value })}
        />
        {items.map((it, i) => (
          <input
            key={i}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            value={String((it as { text?: string }).text ?? it ?? '')}
            onChange={(e) => {
              const n = [...items];
              n[i] = typeof it === 'object' && it ? { ...it, text: e.target.value } : { text: e.target.value };
              setItems(n);
            }}
          />
        ))}
      </div>
    );
  }

  if (t === 'drawing_box') {
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Zeichenfeld</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          value={String(block.title ?? '')}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <textarea
          className="min-h-[72px] w-full rounded border border-slate-300 px-2 py-1 text-sm"
          value={String(block.instruction ?? '')}
          onChange={(e) => patch({ instruction: e.target.value })}
        />
      </div>
    );
  }

  if (t === 'writing_lines') {
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Schreiblinien</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          value={String(block.title ?? '')}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <Field label="Anzahl Linien">
          <input
            type="number"
            min={0}
            max={40}
            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
            value={Number(block.lines ?? 0)}
            onChange={(e) => patch({ lines: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
    );
  }

  if (t === 'table') {
    const columns =
      (block.columns as { key: string; label: string }[]) ||
      ((block.headers as string[]) || []).map((h, i) => ({ key: `c${i}`, label: String(h) }));
    const rows = (block.rows as Record<string, unknown>[]) || [];
    const setRows = (next: Record<string, unknown>[]) => patch({ rows: next, columns });
    const setColumnLabel = (ci: number, label: string) => {
      const cols = [...columns];
      cols[ci] = { ...cols[ci], label };
      patch({ columns: cols, rows });
    };
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Tabelle</span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          value={String(block.title ?? '')}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <p className="text-xs text-slate-500">Spaltenbeschriftungen und Zellen — alles bearbeitbar.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-slate-300 text-sm">
            <thead>
              <tr>
                {columns.map((c, ci) => (
                  <th key={c.key} className="border border-slate-300 bg-white p-0">
                    <input
                      className="w-full px-1 py-1"
                      value={c.label}
                      onChange={(e) => setColumnLabel(ci, e.target.value)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {columns.map((c) => (
                    <td key={c.key} className="border border-slate-200 p-0">
                      <input
                        className="w-full min-w-[80px] px-1 py-1"
                        value={String(row[c.key] ?? '')}
                        onChange={(e) => {
                          const n = rows.map((r, j) =>
                            j === ri ? { ...r, [c.key]: e.target.value } : r
                          );
                          setRows(n);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
      Unbekannter Blocktyp „{t}“. Rohdaten unter &quot;Erweitert&quot; bearbeiten.
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(block, null, 2)}</pre>
    </div>
  );
}

export function WorksheetContentEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const pages = (content.pages as { page_label?: string; blocks: Record<string, unknown>[] }[]) || [];

  const setBlock = (pi: number, bi: number, nb: Record<string, unknown>) => {
    const nextPages = pages.map((p, i) => {
      if (i !== pi) return p;
      const bl = [...(p.blocks || [])];
      bl[bi] = nb;
      return { ...p, blocks: bl };
    });
    onChange({ ...content, pages: nextPages });
  };

  const setPageLabel = (pi: number, label: string) => {
    const nextPages = pages.map((p, i) => (i === pi ? { ...p, page_label: label } : p));
    onChange({ ...content, pages: nextPages });
  };

  const setSolution = (i: number, field: 'label' | 'answer', v: string) => {
    const sol = [...((content.solutions as Record<string, unknown>[]) || [])];
    const row = { ...(sol[i] || {}) };
    row[field] = v;
    sol[i] = row;
    onChange({ ...content, solutions: sol });
  };

  const pres = (content.presentation || {}) as Record<string, string>;
  const setPres = (k: string, v: string) => {
    onChange({ ...content, presentation: { ...pres, [k]: v } });
  };

  const notes = ((content.design_notes as string[]) || []).join('\n');

  return (
    <div className="space-y-6 text-sm">
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Kopfzeile (Arbeitsblatt)</h3>
        <Field label="Titel">
          <input
            className="w-full rounded border border-slate-300 px-2 py-1.5"
            value={String(content.title ?? '')}
            onChange={(e) => onChange({ ...content, title: e.target.value })}
          />
        </Field>
        <Field label="Untertitel">
          <input
            className="w-full rounded border border-slate-300 px-2 py-1.5"
            value={String(content.subtitle ?? '')}
            onChange={(e) => onChange({ ...content, subtitle: e.target.value })}
          />
        </Field>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Erscheinungsbild (Typografie)</h3>
        <p className="text-xs text-slate-500">
          Werte wie von der KI gesetzt — hier anpassbar, wirkt auf Vorschau & Druck (Schriftgrößen, Dichte).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Text (Fließtext)">
            <select
              className="w-full rounded border border-slate-300 px-2 py-1.5"
              value={pres.text_scale || 'md'}
              onChange={(e) => setPres('text_scale', e.target.value)}
            >
              {['xs', 'sm', 'md', 'lg', 'xl'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Aufgaben">
            <select
              className="w-full rounded border border-slate-300 px-2 py-1.5"
              value={pres.task_text_scale || 'md'}
              onChange={(e) => setPres('task_text_scale', e.target.value)}
            >
              {['sm', 'md', 'lg', 'xl'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Überschrift Titel">
            <select
              className="w-full rounded border border-slate-300 px-2 py-1.5"
              value={pres.heading_scale || '2xl'}
              onChange={(e) => setPres('heading_scale', e.target.value)}
            >
              {['lg', 'xl', '2xl', '3xl'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Zeilenabstand">
            <select
              className="w-full rounded border border-slate-300 px-2 py-1.5"
              value={pres.line_height || 'normal'}
              onChange={(e) => setPres('line_height', e.target.value)}
            >
              <option value="tight">eng</option>
              <option value="normal">normal</option>
              <option value="relaxed">locker</option>
            </select>
          </Field>
          <Field label="Dichte">
            <select
              className="w-full rounded border border-slate-300 px-2 py-1.5"
              value={pres.density || 'normal'}
              onChange={(e) => setPres('density', e.target.value)}
            >
              <option value="sparse">luftig</option>
              <option value="normal">normal</option>
              <option value="dense">kompakt</option>
            </select>
          </Field>
          <Field label="Register">
            <select
              className="w-full rounded border border-slate-300 px-2 py-1.5"
              value={pres.register || 'neutral'}
              onChange={(e) => setPres('register', e.target.value)}
            >
              <option value="child_friendly">Kindgerecht</option>
              <option value="youth">Jugendlich</option>
              <option value="neutral">Neutral</option>
              <option value="formal_academic">Formell / akademisch</option>
              <option value="professional">Beruflich</option>
            </select>
          </Field>
        </div>
        <Field label="Planung / Begründung (Freitext)">
          <textarea
            className="min-h-[64px] w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={pres.planning_rationale || ''}
            onChange={(e) => setPres('planning_rationale', e.target.value)}
          />
        </Field>
      </section>

      {pages.map((page, pi) => (
        <section key={pi} className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-indigo-900">Seite {pi + 1}</h3>
            <input
              className="min-w-[200px] flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              placeholder="Seitenzeile (z. B. Fortsetzung) — optional"
              value={page.page_label || ''}
              onChange={(e) => setPageLabel(pi, e.target.value)}
            />
          </div>
          <div className="space-y-4">
            {(page.blocks || []).map((block, bi) => (
              <BlockEditor
                key={(block.id as string) || `${pi}-${bi}`}
                block={block}
                onChange={(nb) => setBlock(pi, bi, nb)}
              />
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Lösungen</h3>
        <div className="space-y-2">
          {((content.solutions as Record<string, unknown>[]) || []).map((s, i) => (
            <div key={i} className="grid grid-cols-[5rem_1fr] gap-2">
              <input
                className="rounded border border-slate-300 px-2 py-1"
                value={String(s.label ?? '')}
                onChange={(e) => setSolution(i, 'label', e.target.value)}
              />
              <input
                className="rounded border border-slate-300 px-2 py-1"
                value={String(s.answer ?? '')}
                onChange={(e) => setSolution(i, 'answer', e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Design-Hinweise (eine Zeile pro Stichpunkt)</h3>
        <textarea
          className="mt-2 min-h-[80px] w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
          value={notes}
          onChange={(e) =>
            onChange({
              ...content,
              design_notes: e.target.value.split('\n').filter(Boolean),
            })
          }
        />
      </section>
    </div>
  );
}
