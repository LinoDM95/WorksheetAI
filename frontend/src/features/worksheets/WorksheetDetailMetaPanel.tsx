import { ChevronDown } from 'lucide-react';
import { CatalogSubjectSelect } from '../../components/CatalogSubjectSelect';
import { Button, TextInput } from '../../components/ui';
import { LIBRARY_GRADE_STEPS } from '../boards/lib/libraryCatalogFilters';
import type { Worksheet } from '../../types';

const selectXs =
  'h-8 max-w-[3.25rem] rounded-lg border border-slate-200 bg-white px-1.5 py-0 text-xs text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30';

export function WorksheetDetailMetaPanel({
  worksheet,
  metaTitle,
  setMetaTitle,
  metaSubject,
  setMetaSubject,
  metaTopic,
  setMetaTopic,
  metaGradeFrom,
  setMetaGradeFrom,
  metaGradeTo,
  setMetaGradeTo,
  metaDuration,
  setMetaDuration,
  metaFormError,
  onSaveMeta,
  savePending,
}: {
  worksheet: Worksheet;
  metaTitle: string;
  setMetaTitle: (v: string) => void;
  metaSubject: string;
  setMetaSubject: (v: string) => void;
  metaTopic: string;
  setMetaTopic: (v: string) => void;
  metaGradeFrom: string;
  setMetaGradeFrom: (v: string) => void;
  metaGradeTo: string;
  setMetaGradeTo: (v: string) => void;
  metaDuration: string;
  setMetaDuration: (v: string) => void;
  metaFormError: string | null;
  onSaveMeta: () => void;
  savePending: boolean;
}) {
  return (
    <details
      className="no-print group/ws-meta shrink-0 border-b border-slate-200/80 bg-white/90 open:bg-slate-50/50"
      open
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1 sm:px-3 [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={14}
          className="shrink-0 text-slate-400 transition-transform duration-200 ease-out group-open/ws-meta:rotate-180"
          aria-hidden
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Unterrichtsdaten &amp; Titel
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[11px] text-slate-500"
          title={
            [
              (metaTitle || worksheet.title || '').trim(),
              metaSubject.trim(),
              metaGradeFrom && metaGradeTo ? `Kl. ${metaGradeFrom}–${metaGradeTo}` : '',
              metaDuration ? `${metaDuration} Min` : '',
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        >
          {[
            (metaTitle || worksheet.title || '').trim(),
            metaSubject.trim(),
            metaGradeFrom && metaGradeTo ? `Kl. ${metaGradeFrom}–${metaGradeTo}` : '',
            metaDuration ? `${metaDuration} Min` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'Zum Bearbeiten aufklappen'}
        </span>
      </summary>
      <div className="border-t border-slate-100 px-2 pb-2 pt-1.5 sm:px-3">
        <div className="flex flex-wrap items-end gap-x-2 gap-y-1.5">
          <div className="min-w-[min(100%,12rem)] flex-1 basis-[10rem]">
            <label className="mb-0.5 block text-[10px] font-medium text-slate-500" htmlFor="ws-meta-title">
              Titel
            </label>
            <TextInput
              id="ws-meta-title"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              maxLength={255}
              placeholder="Arbeitsblatt-Titel"
              autoComplete="off"
              className="!h-8 !min-h-0 !py-1 text-xs"
            />
          </div>
          <div className="w-full min-w-[6.5rem] max-w-[10rem] sm:w-[8.5rem]">
            <label className="mb-0.5 block text-[10px] font-medium text-slate-500" htmlFor="ws-meta-subject">
              Fach
            </label>
            <CatalogSubjectSelect
              id="ws-meta-subject"
              value={metaSubject}
              onChange={(v) => setMetaSubject(v.slice(0, 120))}
              emptyLabel="—"
              aria-label="Fach"
              className="h-8 max-w-full rounded-lg border border-slate-200 bg-white px-1.5 py-0 text-xs text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
            />
          </div>
          <div className="min-w-[7rem] flex-1 basis-[7rem]">
            <label className="mb-0.5 block text-[10px] font-medium text-slate-500" htmlFor="ws-meta-topic">
              Thema
            </label>
            <TextInput
              id="ws-meta-topic"
              value={metaTopic}
              onChange={(e) => setMetaTopic(e.target.value)}
              placeholder="Kurz"
              autoComplete="off"
              className="!h-8 !min-h-0 !py-1 text-xs"
            />
          </div>
          <div className="flex items-end gap-1">
            <div>
              <span className="mb-0.5 block text-[10px] font-medium text-slate-500">Stufe</span>
              <div className="flex gap-1">
                <select
                  id="ws-meta-grade-from"
                  className={selectXs}
                  value={metaGradeFrom}
                  onChange={(e) => setMetaGradeFrom(e.target.value)}
                  aria-label="Klassenstufe von"
                >
                  <option value="">—</option>
                  {LIBRARY_GRADE_STEPS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  id="ws-meta-grade-to"
                  className={selectXs}
                  value={metaGradeTo}
                  onChange={(e) => setMetaGradeTo(e.target.value)}
                  aria-label="Klassenstufe bis"
                >
                  <option value="">—</option>
                  {LIBRARY_GRADE_STEPS.map((s) => (
                    <option key={`t-${s}`} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="w-[4rem]">
            <label className="mb-0.5 block text-[10px] font-medium text-slate-500" htmlFor="ws-meta-duration">
              Min.
            </label>
            <TextInput
              id="ws-meta-duration"
              type="number"
              min={5}
              max={90}
              value={metaDuration}
              onChange={(e) => setMetaDuration(e.target.value)}
              className="!h-8 !min-h-0 !py-1 text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="!h-8 shrink-0"
            loading={savePending}
            disabled={savePending}
            onClick={(e) => {
              e.preventDefault();
              onSaveMeta();
            }}
          >
            Speichern
          </Button>
        </div>
        {metaFormError ? (
          <p className="mt-1.5 text-[11px] text-red-700" role="alert">
            {metaFormError}
          </p>
        ) : (
          <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
            Privat: Titel, Fach, Thema, Stufe und Dauer für deine Galerie — wie in der Liste und in Vorschaueinträgen.
            Öffentliche Bibliothekstexte legst du separat fest.
          </p>
        )}
      </div>
    </details>
  );
}
