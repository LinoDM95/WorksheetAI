import { useEffect, useState, type SetStateAction } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Worksheet } from '../../types';
import { updateDraftBlock, updateDraftBlockItem } from '../../lib/contentDraft';
import { A4WorksheetRenderer } from './A4WorksheetRenderer';
import { normalizeContentForEdit, WorksheetContentEditor } from './WorksheetContentEditor';
import { WorksheetLineControls } from './WorksheetLineControls';

export function WorksheetPage() {
  const { id } = useParams();
  const [ws, setWs] = useState<Worksheet | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [previewRm, setPreviewRm] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [regenModalPage, setRegenModalPage] = useState<number | null>(null);
  const [regenInstruction, setRegenInstruction] = useState('');
  const [regenBusyPage, setRegenBusyPage] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/worksheets/${id}/`).then((r) => setWs(r.data));
  }, [id]);

  useEffect(() => {
    if (!editing || !draft || !id) return;
    const t = window.setTimeout(() => {
      api
        .post(`/worksheets/${id}/preview-render/`, { content: draft })
        .then((r) => {
          setPreviewRm(r.data.render_model);
          const next = r.data.content;
          if (next && typeof next === 'object') {
            const pagesBefore = JSON.stringify(draft.pages ?? null);
            const pagesAfter = JSON.stringify((next as { pages?: unknown }).pages ?? null);
            if (pagesBefore !== pagesAfter) {
              setDraft(next as Record<string, unknown>);
            }
          }
        })
        .catch(() => setPreviewRm(null));
    }, 380);
    return () => window.clearTimeout(t);
  }, [draft, editing, id]);

  const startEdit = () => {
    if (!ws) return;
    setErr('');
    const d = normalizeContentForEdit(ws.content as Record<string, unknown>);
    setDraft(d);
    setEditing(true);
    setPreviewRm(null);
    if (id) {
      api
        .post(`/worksheets/${id}/preview-render/`, { content: d })
        .then((r) => setPreviewRm(r.data.render_model))
        .catch(() => {});
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
    setPreviewRm(null);
    setErr('');
    setRegenModalPage(null);
    setRegenInstruction('');
    setRegenBusyPage(null);
  };

  const save = async () => {
    if (!ws || !id || !draft) return;
    setSaving(true);
    setErr('');
    try {
      const r = await api.patch(`/worksheets/${id}/`, { content: draft });
      setWs(r.data);
      setEditing(false);
      setDraft(null);
      setPreviewRm(null);
    } catch (e: unknown) {
      const m = e as { response?: { data?: { detail?: string } } };
      setErr(m.response?.data?.detail || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  if (!ws) return <p className="p-6 text-slate-600">Lade…</p>;

  const displayRm =
    editing && previewRm ? previewRm : ((ws.render_model || {}) as Record<string, unknown>);
  const viewWorksheet: Worksheet = {
    ...ws,
    title: (editing && draft?.title ? String(draft.title) : ws.title) as string,
    render_model: displayRm,
  };

  const handleDraftFromSheet = (action: SetStateAction<Record<string, unknown>>) => {
    setDraft((prev) => {
      const base = (prev ?? {}) as Record<string, unknown>;
      return typeof action === 'function' ? action(base) : action;
    });
  };

  const handleOpenRegenPage = (pageIndex: number) => {
    setRegenInstruction('');
    setRegenModalPage(pageIndex);
  };

  const handleCloseRegenModal = () => {
    if (regenBusyPage !== null) return;
    setRegenModalPage(null);
    setRegenInstruction('');
  };

  const handleConfirmRegenPage = async () => {
    if (!id || !draft || regenModalPage === null) return;
    setRegenBusyPage(regenModalPage);
    setErr('');
    try {
      const r = await api.post(`/worksheets/${id}/regenerate-page/`, {
        page_index: regenModalPage,
        teacher_instruction: regenInstruction.trim(),
        content: draft,
      });
      setDraft(r.data.content);
      setPreviewRm(r.data.render_model);
      setRegenModalPage(null);
      setRegenInstruction('');
    } catch (e: unknown) {
      const m = e as { response?: { data?: { detail?: string } } };
      setErr(m.response?.data?.detail || 'Seiten-Neugenerierung fehlgeschlagen.');
    } finally {
      setRegenBusyPage(null);
    }
  };

  return (
    <>
      {regenModalPage !== null ? (
        <div
          className="no-print fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/45 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="regen-dialog-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCloseRegenModal();
          }}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Dialog schließen"
            onClick={handleCloseRegenModal}
          />
          <div
            className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="regen-dialog-title" className="text-base font-semibold text-slate-900">
              Seite {regenModalPage + 1} mit KI neu gestalten
            </h2>
            <p className="mt-1 text-xs leading-snug text-slate-600">
              Es wird <strong>nur diese eine Seite</strong> ersetzt (Rest bleibt). Optional: Wünsche zur Struktur oder zum Schwierigkeitsgrad.
            </p>
            <label className="mt-3 block text-xs font-medium text-slate-700" htmlFor="regen-instruction">
              Anweisung an die KI (optional)
            </label>
            <textarea
              id="regen-instruction"
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
              rows={3}
              maxLength={4000}
              disabled={regenBusyPage !== null}
              placeholder="z. B. mehr Übungsaufgaben, weniger Text, andere Aufgabenstellung …"
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:bg-slate-50"
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={regenBusyPage !== null}
                onClick={handleCloseRegenModal}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={regenBusyPage !== null}
                onClick={() => void handleConfirmRegenPage()}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {regenBusyPage !== null ? 'KI arbeitet…' : 'Seite neu generieren'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pb-16">
      {editing ? (
        <div className="no-print mb-2 space-y-2" role="region" aria-label="Bearbeitung">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h1
              className="min-w-0 max-w-[min(100%,520px)] flex-1 truncate text-lg font-bold leading-tight text-slate-900"
              title={ws.title}
            >
              {ws.title}
            </h1>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={cancelEdit}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Abbrechen
              </button>
            </div>
          </div>
          <p className="text-[11px] leading-snug text-slate-500">
            <span className="font-medium text-slate-600">Je Block oben rechts</span>: Typ wählen,{' '}
            <strong className="font-medium">Darüber / Darunter</strong> zum Einfügen,{' '}
            <strong className="font-medium text-red-800">Löschen</strong>. Bei{' '}
            <span className="font-medium">nummerierten Aufgaben / Raster / Checkliste</span> stehen{' '}
            <strong>+ −</strong> an den Zeilen. Unten auf jeder Seite: neue Blöcke, neue Seite, Seite löschen. Kurze Formeln: Feld verlassen → ggf.{' '}
            <code className="rounded bg-slate-100 px-0.5">$…$</code>. Funken-Symbol nur für KI-Seitenumbau.
          </p>
          {err ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              {err}
            </div>
          ) : null}
          {draft ? (
            <WorksheetLineControls
              content={draft}
              onPatchBlock={(pi, bi, p) =>
                handleDraftFromSheet((prev) => updateDraftBlock(prev, pi, bi, p))
              }
              onPatchItem={(pi, bi, ii, p) =>
                handleDraftFromSheet((prev) => updateDraftBlockItem(prev, pi, bi, ii, p))
              }
            />
          ) : null}
        </div>
      ) : (
        <>
          <div className="no-print mb-4 flex flex-wrap items-center gap-3">
            <h1 className="flex-1 text-2xl font-bold text-slate-900">{ws.title}</h1>
            <button
              type="button"
              onClick={startEdit}
              className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
            >
              Inhalt bearbeiten
            </button>
            <div className="no-print flex flex-col gap-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800"
              >
                Als PDF / Drucken
              </button>
              <span className="text-xs text-slate-500">
                Im System-Dialog als Ziel <strong>„PDF speichern“</strong> / <strong>Microsoft Print to PDF</strong> wählen.
              </span>
            </div>
          </div>
          {err ? (
            <div className="no-print mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {err}
            </div>
          ) : null}
        </>
      )}

      <div className="overflow-x-auto overflow-y-visible rounded-lg border border-slate-200 bg-white print:border-0 print:rounded-none">
        <A4WorksheetRenderer
          worksheet={viewWorksheet}
          showGuide={false}
          contentDraft={editing && draft ? draft : undefined}
          onContentDraftChange={editing ? handleDraftFromSheet : undefined}
          onRequestRegeneratePage={editing && draft && id ? handleOpenRegenPage : undefined}
          regeneratePageBusyIndex={regenBusyPage}
        />
      </div>

      {editing && draft && (
        <details className="no-print mt-3 rounded-lg border border-slate-200 bg-slate-50/90">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-indigo-800 [&::-webkit-details-marker]:hidden">
            Erweitert · alle Felder als Liste
          </summary>
          <div className="max-h-[38vh] overflow-y-auto border-t border-slate-200 bg-white px-3 py-2">
            <WorksheetContentEditor content={draft} onChange={(c) => setDraft(c)} />
          </div>
        </details>
      )}

      {ws.content &&
        typeof ws.content === 'object' &&
        Array.isArray((ws.content as { validation_errors?: unknown[] }).validation_errors) &&
        (ws.content as { validation_errors: unknown[] }).validation_errors.length > 0 && (
          <div className="no-print mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <b>Validierungswarnungen</b>
            <pre className="mt-2 overflow-auto text-xs">
              {JSON.stringify((ws.content as { validation_errors: unknown[] }).validation_errors, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}
