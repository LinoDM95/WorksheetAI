import { useEffect, useState } from 'react';
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
import { generateBoard } from '../boardsApi';
import { BoardAiGenerationOverlay } from './BoardAiGenerationOverlay';
import { BoardBuilderModal } from '../builder/BoardBuilderModal';
import type { BoardGeneratePayload, VisualStyleId } from '../types';
import { cn } from '../../../lib/cn';
import { addPendingFirstOpenBoard } from '../lib/boardFirstOpenHighlight';

type BoardCreationMode = 'creative' | 'blocks';

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
  'Baue ein Tafelbild zum Zweiten Weltkrieg mit Zeit-Slider 1938 → 1945 (vereinfachte Karte).',
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
  const [mode, setMode] = useState<BoardCreationMode>('creative');

  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState(15);
  const [visualStyle, setVisualStyle] = useState<VisualStyleId>('auto');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: BoardGeneratePayload) => generateBoard(payload),
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      addPendingFirstOpenBoard(board.id);
      onPendingHighlightChange?.();
      onClose();
      setError(null);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail;
      setError(detail || (err as Error)?.message || 'Generierung fehlgeschlagen.');
    },
  });

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
    if (!prompt.trim()) {
      setError('Bitte beschreibe in eigenen Worten, was das Tafelbild zeigen soll.');
      return;
    }
    const payload: BoardGeneratePayload = {
      prompt: prompt.trim(),
      subject: subject.trim() || undefined,
      grade: grade.trim() || undefined,
      topic: topic.trim() || undefined,
      duration_minutes: duration,
      creativity: 'experimentell',
      visual_style: visualStyle,
    };
    createMutation.mutate(payload);
  };

  const busy = createMutation.isPending;

  if (!open || typeof document === 'undefined') return null;

  if (mode === 'blocks') {
    return (
      <BoardBuilderModal
        open={open}
        onClose={() => {
          setMode('creative');
          onClose();
        }}
        onPendingHighlightChange={onPendingHighlightChange}
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <BoardAiGenerationOverlay open={busy} variant="generate" />
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
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Neues interaktives Tafelbild</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500 sm:text-xs">
              Wähle den Modus: Kreativ (KI baut das ganze Bild) oder Bausteine (geprüfte Templates).
            </p>
          </div>
          <IconButton type="button" variant="ghost" size="sm" aria-label="Schließen" disabled={busy} onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>

        <div className="flex shrink-0 items-center gap-1 border-b border-slate-100 px-4 pt-2 sm:px-5">
          <ModeTab active={mode === 'creative'} onClick={() => setMode('creative')} label="Kreativ" hint="KI baut frei" icon={<Sparkles size={14} aria-hidden />} />
          <ModeTab active={false} onClick={() => setMode('blocks')} label="Bausteine" hint="Geprüfte Templates" icon={<Blocks size={14} aria-hidden />} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          <div className="space-y-5">
            <Card className="!p-5 sm:!p-6 space-y-5 shadow-none sm:!shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fach" htmlFor="b-subject-modal">
                  <TextInput
                    id="b-subject-modal"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="z. B. Sachunterricht"
                  />
                </Field>
                <Field label="Klasse" htmlFor="b-grade-modal">
                  <TextInput
                    id="b-grade-modal"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    placeholder="z. B. 5"
                  />
                </Field>
              </div>

              <Field label="Thema (kurz)" htmlFor="b-topic-modal">
                <TextInput
                  id="b-topic-modal"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="z. B. Wasserkreislauf"
                />
              </Field>

              <Field label="Geplante Dauer (Minuten)" htmlFor="b-duration-modal" className="max-w-[12rem]">
                <TextInput
                  id="b-duration-modal"
                  type="number"
                  min={5}
                  max={90}
                  value={String(duration)}
                  onChange={(e) => setDuration(Math.max(5, Math.min(90, Number(e.target.value) || 15)))}
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
                help="Beschreibe Inhalt, Schwerpunkte, gewünschte Aktivitäten (z. B. Schieberegler, Schritte, Quiz) und Lernziele — die KI leitet passende Interaktionen daraus ab."
              >
                <textarea
                  id="b-prompt-modal"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  placeholder="z. B. Erkläre den Wasserkreislauf mit Buttons …"
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
                  <span className="truncate">Interaktives Tafelbild erzeugen</span>
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
}: {
  active: boolean;
  label: string;
  hint: string;
  icon: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
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
