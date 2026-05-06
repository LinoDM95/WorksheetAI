import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';

type Variant = 'generate' | 'revise';

const COPY: Record<Variant, { title: string; body: string }> = {
  generate: {
    title: 'Board wird erzeugt',
    body: 'Die KI erstellt dein interaktives Smartboard. Das kann etwas dauern — bitte dieses Fenster nicht schließen.',
  },
  revise: {
    title: 'Überarbeitung läuft',
    body: 'Die KI passt HTML, CSS und JavaScript an. Bitte warten — die Vorschau aktualisiert sich danach automatisch.',
  },
};

type Props = {
  open: boolean;
  variant: Variant;
  /** Kurzer deutschsprachiger Fortschrittstext (Kreativ-Generierung mit Stream). */
  phaseDescription?: string | null;
  /** 0–100 für die Fortschrittsleiste; ohne Wert keine Leiste. */
  progressPercent?: number | null;
};

export const BoardAiGenerationOverlay = ({
  open,
  variant,
  phaseDescription,
  progressPercent,
}: Props) => {
  const text = COPY[variant];
  const desc = phaseDescription?.trim() || text.body;
  const showBar = typeof progressPercent === 'number' && variant === 'generate';

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      document.body.style.removeProperty('overflow');
    };
  }, []);

  if (typeof document === 'undefined' || !open) return null;

  const pctRounded = Math.max(0, Math.min(100, Math.round(progressPercent ?? 0)));

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="board-ai-overlay-title"
      aria-describedby="board-ai-overlay-desc"
    >
      <div
        className="absolute inset-0 bg-[var(--color-ink-900)]/[0.28] backdrop-blur-[14px]"
        aria-hidden
      />
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 text-center shadow-[var(--shadow-xl)]">
          <div className="mx-auto mb-7 flex h-[4.5rem] w-[4.5rem] items-center justify-center">
            <div className="relative h-16 w-16">
              <div
                className="board-ai-overlay__spinner-ring absolute inset-0 rounded-full border-2 border-[var(--color-primary-200)] border-t-[var(--color-primary-600)]"
                aria-hidden
              />
              <Sparkles
                className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-[var(--color-primary-600)]"
                strokeWidth={1.85}
                aria-hidden
              />
            </div>
          </div>
          <h2
            id="board-ai-overlay-title"
            className="font-display text-xl font-semibold tracking-tight text-[var(--color-ink-900)] sm:text-2xl"
          >
            {text.title}
          </h2>
          <p
            id="board-ai-overlay-desc"
            className="mt-3 text-sm leading-relaxed text-[var(--color-ink-600)]"
          >
            {desc}
          </p>
          {showBar ? (
            <div
              className="mt-6 w-full"
              role="progressbar"
              aria-valuenow={pctRounded}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Fortschritt der Generierung"
            >
              <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-muted)] ring-1 ring-[var(--color-border)]/80">
                <div
                  className="h-full rounded-full bg-[var(--color-primary-500)] transition-[width] duration-300 ease-out"
                  style={{ width: `${pctRounded}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
              <span className="board-ai-overlay__dot h-2 w-2 rounded-full bg-[var(--color-primary-500)]" />
              <span className="board-ai-overlay__dot h-2 w-2 rounded-full bg-[var(--color-primary-500)]" />
              <span className="board-ai-overlay__dot h-2 w-2 rounded-full bg-[var(--color-primary-500)]" />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
