import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button, Field, IconButton, TextInput, Alert } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import {
  defaultLibraryListingCategoryFromBoardType,
  type LibraryListingCategory,
} from '../lib/libraryCatalogFilters';

export type BoardLibraryListingForm = {
  library_listing_title: string;
  library_listing_topic: string;
  library_listing_description: string;
  /** Nur bei Tafeln (`resourceKind: board`); nicht bei Arbeitsblättern setzen. */
  library_listing_category?: LibraryListingCategory;
};

type Props = {
  open: boolean;
  mode: 'publish' | 'edit_listing';
  onClose: () => void;
  busy: boolean;
  error: string | null;
  /** Private Metadaten nur als Platzhalter-Hinweise (nicht automatisch übernommen). */
  privateHints: { title: string; topic: string };
  initialListing?: BoardLibraryListingForm;
  onSubmit: (payload: BoardLibraryListingForm) => void;
  /** Standard: Lehrkraft — Einreichung vor Freigabe. Staff: direkte Veröffentlichung. */
  moderationRequired?: boolean;
  /** Steuert Hilfstexte (Tafel vs. Arbeitsblatt). */
  resourceKind?: 'board' | 'worksheet';
  /** Nur Tafeln: für Vorauswahl der Bibliotheks-Art beim ersten Veröffentlichen. */
  boardTypeHint?: string;
};

const CATEGORY_OPTIONS: { value: LibraryListingCategory; label: string; hint: string }[] = [
  { value: 'tasks', label: 'Aufgaben', hint: 'Übungen, Quiz, feste Aufgabenstellungen' },
  { value: 'games', label: 'Spiele', hint: 'Interaktive Spiele, Entdecken am Smartboard' },
  { value: 'presentations', label: 'Präsentation', hint: 'Einstieg, Erklärung, Karte, Demonstration' },
];

export const BoardLibraryPublishModal = ({
  open,
  mode,
  onClose,
  busy,
  error,
  privateHints,
  initialListing,
  onSubmit,
  moderationRequired = true,
  resourceKind = 'board',
  boardTypeHint,
}: Props) => {
  const rk = resourceKind;
  const snapshotPossessive = rk === 'worksheet' ? 'deines Arbeitsblatts' : 'deiner Tafel';
  const descriptionFieldHelp =
    rk === 'worksheet'
      ? 'Was Nutzer in der Bibliothek über dein Arbeitsblatt erfahren sollen.'
      : 'Was Nutzer in der Bibliothek über deine Tafel erfahren sollen.';
  const editListingIntro =
    rk === 'worksheet'
      ? 'Titel, Thema und Beschreibung gelten nur für die öffentliche Bibliothekskarte. Der private Titel deines Arbeitsblatts bleibt unverändert.'
      : 'Titel, Thema und Beschreibung gelten nur für die öffentliche Bibliothekskarte. Dein privater Board-Titel bleibt unverändert.';
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [listingCategory, setListingCategory] = useState<LibraryListingCategory>('presentations');

  useEffect(() => {
    if (!open) return;
    if (initialListing) {
      setTitle(initialListing.library_listing_title);
      setTopic(initialListing.library_listing_topic);
      setDescription(initialListing.library_listing_description);
      if (rk === 'board' && initialListing.library_listing_category) {
        setListingCategory(initialListing.library_listing_category);
      } else if (rk === 'board') {
        setListingCategory(defaultLibraryListingCategoryFromBoardType(boardTypeHint));
      }
    } else {
      setTitle('');
      setTopic('');
      setDescription('');
      if (rk === 'board') {
        setListingCategory(defaultLibraryListingCategoryFromBoardType(boardTypeHint));
      }
    }
  }, [open, initialListing, rk, boardTypeHint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open || busy) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const handleSubmit = () => {
    const t = title.trim();
    const k = topic.trim();
    const d = description.trim();
    if (!t || !k || !d) return;
    if (rk === 'board') {
      onSubmit({
        library_listing_title: t,
        library_listing_topic: k,
        library_listing_description: d,
        library_listing_category: listingCategory,
      });
      return;
    }
    onSubmit({
      library_listing_title: t,
      library_listing_topic: k,
      library_listing_description: d,
    });
  };

  if (!open || typeof document === 'undefined') return null;

  const privTitle = privateHints.title?.trim() || 'Ohne Titel';
  const privTopic = privateHints.topic?.trim() || '—';
  const canSubmit =
    Boolean(title.trim() && topic.trim() && description.trim()) && (rk === 'worksheet' || Boolean(listingCategory));

  return createPortal(
    <div className="fixed inset-0 z-[135] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        aria-label="Dialog schließen"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        className={cn(
          'relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
              {mode === 'publish'
                ? moderationRequired
                  ? 'Zur Bibliothek einreichen'
                  : 'In der Bibliothek veröffentlichen'
                : 'Öffentliche Angaben bearbeiten'}
            </h2>
            <p className="mt-1 text-[11px] leading-snug text-slate-500 sm:text-xs">
              {mode === 'publish'
                ? moderationRequired
                  ? `Dein Eintrag wird von einer Administratorin oder einem Administrator geprüft. Erst nach Freigabe ist er für alle Kolleg:innen in der öffentlichen Bibliothek sichtbar. Bibliotheks-Besuchende sehen später einen festen Schnappschuss ${snapshotPossessive}.`
                  : `Bibliotheks-Besuchende sehen einen festen Schnappschuss ${snapshotPossessive}. Änderungen in deiner privaten Arbeitsversion werden nicht automatisch übernommen — du kannst die öffentliche Fassung später gezielt aktualisieren.`
                : editListingIntro}
            </p>
          </div>
          <IconButton type="button" variant="ghost" size="sm" aria-label="Schließen" disabled={busy} onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>

        <div className="max-h-[min(70dvh,520px)] space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {error ? <Alert tone="error">{error}</Alert> : null}
          {mode === 'publish' ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              Nur zur Orientierung (privat, nicht übernommen):{' '}
              <span className="font-medium text-slate-800">{privTitle}</span>
              {privTopic !== '—' ? (
                <>
                  {' '}
                  · Thema <span className="font-medium text-slate-800">{privTopic}</span>
                </>
              ) : null}
            </p>
          ) : null}

          {rk === 'board' ? (
            <fieldset className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
              <legend className="px-0.5 text-xs font-semibold text-slate-800">Art in der Bibliothek</legend>
              <p className="text-[11px] leading-snug text-slate-500">
                So erscheint dein Board unter Aufgaben, Spiele oder Präsentation in der öffentlichen Bibliothek.
              </p>
              <div className="space-y-2" role="radiogroup" aria-label="Bibliotheks-Art">
                {CATEGORY_OPTIONS.map(({ value, label, hint }) => {
                  const id = `lib-listing-cat-${value}`;
                  return (
                    <label
                      key={value}
                      htmlFor={id}
                      className={cn(
                        'flex cursor-pointer gap-3 rounded-lg border px-3 py-2 transition',
                        listingCategory === value
                          ? 'border-indigo-300 bg-white shadow-sm ring-1 ring-indigo-100'
                          : 'border-slate-200 bg-white/80 hover:border-slate-300',
                      )}
                    >
                      <input
                        id={id}
                        name="library_listing_category"
                        type="radio"
                        className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
                        checked={listingCategory === value}
                        disabled={busy}
                        onChange={() => setListingCategory(value)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900">{label}</span>
                        <span className="block text-[11px] text-slate-500">{hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <Field label="Öffentlicher Titel" htmlFor="lib-pub-title" help="Wird in der Bibliothek angezeigt.">
            <TextInput
              id="lib-pub-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              disabled={busy}
              placeholder="z. B. Interaktive Bruchrechnung"
              autoComplete="off"
            />
          </Field>
          <Field label="Öffentliches Thema" htmlFor="lib-pub-topic">
            <TextInput
              id="lib-pub-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={220}
              disabled={busy}
              placeholder="Kurz, für die Karte"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Öffentliche Beschreibung"
            htmlFor="lib-pub-desc"
            help={descriptionFieldHelp}
          >
            <textarea
              id="lib-pub-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              disabled={busy}
              rows={4}
              className="textarea min-h-[6rem] w-full resize-y text-sm"
              placeholder="Inhalt, Zielgruppe, didaktischer Fokus …"
            />
          </Field>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="button" loading={busy} onClick={handleSubmit} disabled={!canSubmit}>
            {mode === 'publish'
              ? moderationRequired
                ? 'Zur Freigabe einreichen'
                : 'Veröffentlichen'
              : 'Speichern'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
