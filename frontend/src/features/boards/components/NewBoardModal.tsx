import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Blocks, Sparkles, X } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  Field,
  IconButton,
  TextInput,
} from '../../../components/ui';
import { BOARDS_LIST_QUERY_KEY } from '../../../lib/listQueries';
import { generateBoardWithProgress } from '../boardsApi';
import { BoardAiGenerationOverlay } from './BoardAiGenerationOverlay';
import type { BoardGeneratePayload, VisualStyleId } from '../types';
import { cn } from '../../../lib/cn';
import { addPendingFirstOpenBoard } from '../lib/boardFirstOpenHighlight';
import { LIBRARY_GRADE_STEPS, LIBRARY_SUBJECT_FILTER_LABELS } from '../lib/libraryCatalogFilters';

const VISUAL_STYLES: { id: VisualStyleId; label: string; hint: string }[] = [
  { id: 'auto', label: 'Automatisch', hint: 'KI wählt Stil zum Thema.' },
  { id: 'primary_school_playful', label: 'Grundschule (verspielt)', hint: 'Warme Farben, große Buttons, Maskottchen.' },
  { id: 'history_atlas', label: 'Historischer Atlas', hint: 'Gedeckte Töne, Karten, Quellen-Hinweise.' },
  { id: 'museum', label: 'Museum', hint: 'Sachlich, kuratiert, ruhige Hintergründe.' },
  { id: 'science_lab', label: 'Science Lab', hint: 'Geräte, Diagramme, klare Linien.' },
  { id: 'math_grid', label: 'Mathe-Raster', hint: 'Karierter Hintergrund, exakte Formen.' },
  { id: 'chalkboard', label: 'Tafel / Kreide', hint: 'Dunkler Hintergrund, weiße Linien.' },
  { id: 'documentary', label: 'Dokumentarisch', hint: 'Foto-ähnlich, journalistisch.' },
  { id: 'free_creative', label: 'Frei kreativ', hint: 'Modell darf experimentieren.' },
];

const PROMPT_CHIPS = [
  'Erkläre den Wasserkreislauf interaktiv mit Buttons für Verdunstung, Kondensation, Niederschlag und Abfluss.',
  'Baue ein Board zum Zweiten Weltkrieg mit Zeit-Slider 1938 → 1945 (vereinfachte Karte).',
  'Erstelle einen Mathe-Zahlenstrahl bis 100 mit Plus/Minus-Aufgaben und Quiz.',
  'Mache eine Physik-Simulation mit Schiebereglern für Masse und Geschwindigkeit.',
];

type NewBoardModalProps = {
  open: boolean;
  onClose: () => void;
  /** Nach erfolgreicher Erzeugung — Liste aus LocalStorage neu einlesen (Hervorhebung). */
  onPendingHighlightChange?: () => void;
};

export const NewBoardModal = ({ open, onClose, onPendingHighlightChange }: NewBoardModalProps) => {
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState('');
  const [gradeFrom, setGradeFrom] = useState('');
  const [gradeTo, setGradeTo] = useState('');
  const [topic, setTopic] = useState('');
  const [durationStr, setDurationStr] = useState('');
  const [visualStyle, setVisualStyle] = useState<VisualStyleId>('auto');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [genOverlay, setGenOverlay] = useState<{ label: string; pct: number } | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: BoardGeneratePayload) =>
      generateBoardWithProgress(payload, {
        onPhase: (p) => setGenOverlay({ label: p.label, pct: p.pct }),
      }),
    onMutate: () =>
      setGenOverlay({ label: 'Wir bereiten die Generierung vor …', pct: 4 }),
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      addPendingFirstOpenBoard(board.id);
      onPendingHighlightChange?.();
      onClose();
      setError(null);
      setGenOverlay(null);
    },
    onError: (err: unknown) => {
      setGenOverlay(null);
      const detail = (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail;
      setError(detail || (err as Error)?.message || 'Generierung fehlgeschlagen.');
    },
  });

  useEffect(() => {
    if (!open) return;
    setSubject('');
    setGradeFrom('');
    setGradeTo('');
    setTopic('');
    setDurationStr('');
    setPrompt('');
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !createMutation.isPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, createMutation.isPending]);

  const handleSubmit = () => {
    setError(null);
    if (!subject.trim()) {
      setError('Bitte wähle ein Fach.');
      return;
    }
    if (!topic.trim()) {
      setError('Bitte gib ein kurzes Thema an.');
      return;
    }
    if (!gradeFrom || !gradeTo) {
      setError('Bitte wähle Klassenstufe von und bis.');
      return;
    }
    const gf = parseInt(gradeFrom, 10);
    const gt = parseInt(gradeTo, 10);
    if (Number.isNaN(gf) || Number.isNaN(gt) || gf < 1 || gf > 13 || gt < 1 || gt > 13) {
      setError('Klassenstufen müssen zwischen 1 und 13 liegen.');
      return;
    }
    const d = parseInt(durationStr.trim(), 10);
    if (!durationStr.trim() || Number.isNaN(d) || d < 5 || d > 90) {
      setError('Bitte gib eine geplante Dauer zwischen 5 und 90 Minuten an.');
      return;
    }
    if (!prompt.trim()) {
      setError('Bitte beschreibe in eigenen Worten, was das Board zeigen soll.');
      return;
    }
    const payload: BoardGeneratePayload = {
      prompt: prompt.trim(),
      subject: subject.trim(),
      topic: topic.trim(),
      grade_from: gf,
      grade_to: gt,
      duration_minutes: d,
      creativity: 'experimentell',
      visual_style: visualStyle,
    };
    createMutation.mutate(payload);
  };

  const busy = createMutation.isPending;

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <BoardAiGenerationOverlay
        open={busy}
        variant="generate"
        phaseDescription={genOverlay?.label ?? null}
        progressPercent={genOverlay?.pct ?? null}
      />
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
          'relative z-10 flex max-h-[min(92dvh,920px)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl',
          'max-w-[min(100%,720px)]',
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Neues interaktives Board</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500 sm:text-xs">
              Kreativ: die KI baut das Board aus deinem Prompt. Der Bausteinmodus mit geprüften Templates kommt demnächst.
            </p>
          </div>
          <IconButton type="button" variant="ghost" size="sm" aria-label="Schließen" disabled={busy} onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>

        <div className="flex shrink-0 items-center gap-1 border-b border-slate-100 px-4 pt-2 sm:px-5">
          <ModeTab active label="Kreativ" hint="KI baut frei" icon={<Sparkles size={14} aria-hidden />} />
          <ModeTab
            disabled
            comingSoonLabel="Demnächst"
            label="Bausteine"
            hint="Geprüfte Templates"
            icon={<Blocks size={14} aria-hidden />}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          <div className="space-y-5">
            <Card className="!p-5 sm:!p-6 space-y-5 shadow-none sm:!shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fach" htmlFor="b-subject-modal" required>
                  <select
                    id="b-subject-modal"
                    className={cn(
                      'select h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-0 text-sm text-slate-900',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30',
                    )}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    aria-required
                  >
                    <option value="">Bitte wählen …</option>
                    {LIBRARY_SUBJECT_FILTER_LABELS.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Klassenstufe" required htmlFor="b-grade-from-modal">
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      id="b-grade-from-modal"
                      className={cn(
                        'select h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-0 text-sm text-slate-900',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30',
                      )}
                      value={gradeFrom}
                      onChange={(e) => setGradeFrom(e.target.value)}
                      aria-label="Klassenstufe von"
                      aria-required
                    >
                      <option value="">Von …</option>
                      {LIBRARY_GRADE_STEPS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <select
                      id="b-grade-to-modal"
                      className={cn(
                        'select h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-0 text-sm text-slate-900',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30',
                      )}
                      value={gradeTo}
                      onChange={(e) => setGradeTo(e.target.value)}
                      aria-label="Klassenstufe bis"
                      aria-required
                    >
                      <option value="">Bis …</option>
                      {LIBRARY_GRADE_STEPS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>
              </div>

              <Field label="Thema (kurz)" htmlFor="b-topic-modal" required>
                <TextInput
                  id="b-topic-modal"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="z. B. Wasserkreislauf"
                  aria-required
                />
              </Field>

              <Field label="Geplante Dauer (Minuten)" htmlFor="b-duration-modal" className="max-w-[12rem]" required>
                <TextInput
                  id="b-duration-modal"
                  type="number"
                  min={5}
                  max={90}
                  value={durationStr}
                  onChange={(e) => setDurationStr(e.target.value)}
                  placeholder="5–90"
                  aria-required
                />
              </Field>

              <Field label="Visueller Stil" htmlFor="b-visual-modal">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {VISUAL_STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setVisualStyle(s.id)}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-left text-sm transition',
                        visualStyle === s.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <div className="font-semibold text-slate-900">{s.label}</div>
                      <div className="text-xs text-slate-500">{s.hint}</div>
                    </button>
                  ))}
                </div>
              </Field>

              <Field
                label="Beschreibung / Prompt"
                htmlFor="b-prompt-modal"
                required
                help="Beschreibe Inhalt, Schwerpunkte, gewünschte Aktivitäten (z. B. Schieberegler, Schritte, Quiz) und Lernziele — die KI leitet passende Interaktionen daraus ab."
              >
                <textarea
                  id="b-prompt-modal"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  placeholder="z. B. Erkläre den Wasserkreislauf mit Buttons …"
                  aria-required
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                {PROMPT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setPrompt(chip)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {error && <Alert tone="error">{error}</Alert>}

              <div className="flex flex-nowrap items-center justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" className="shrink-0" onClick={onClose} disabled={busy}>
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  className="min-w-0 shrink"
                  onClick={handleSubmit}
                  loading={busy}
                  leftIcon={<Sparkles size={16} aria-hidden />}
                >
                  <span className="truncate">Interaktives Board erzeugen</span>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const ModeTab = ({
  active,
  label,
  hint,
  icon,
  onClick,
  disabled,
  comingSoonLabel,
}: {
  active?: boolean;
  label: string;
  hint: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  comingSoonLabel?: string;
}) => {
  if (disabled) {
    return (
      <div
        className={cn(
          'flex cursor-not-allowed items-center gap-2 rounded-t-lg border-b-2 border-transparent px-3 py-2 text-xs font-medium text-slate-400 opacity-[0.72]',
        )}
        role="note"
        aria-label={`${label}: ${comingSoonLabel ?? 'Demnächst verfügbar'}`}
        title={`${comingSoonLabel ?? 'Demnächst'} — ${hint}`}
      >
        <span className="flex h-5 w-5 items-center justify-center text-slate-400">{icon}</span>
        <span className="font-semibold">{label}</span>
        {comingSoonLabel ? (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {comingSoonLabel}
          </span>
        ) : null}
        <span className="hidden text-[10px] text-slate-400 sm:inline">· {hint}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ?? false}
      className={cn(
        'flex items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition',
        active
          ? 'border-indigo-500 text-indigo-700'
          : 'border-transparent text-slate-500 hover:text-slate-700',
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center text-slate-500">{icon}</span>
      <span className="font-semibold">{label}</span>
      <span className="hidden text-[10px] text-slate-400 sm:inline">· {hint}</span>
    </button>
  );
};
