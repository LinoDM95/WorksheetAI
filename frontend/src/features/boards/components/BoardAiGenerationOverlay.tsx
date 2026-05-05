import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';

type Variant = 'generate' | 'revise';

const COPY: Record<Variant, { title: string; body: string }> = {
  generate: {
    title: 'Tafelbild wird erzeugt',
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
};

export const BoardAiGenerationOverlay = ({ open, variant }: Props) => {
  const text = COPY[variant];

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

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="board-ai-overlay-title"
      aria-describedby="board-ai-overlay-desc"
    >
      <div className="absolute inset-0 bg-[var(--color-ink-900)]/88 backdrop-blur-md" />
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 py-12">
        <div className="board-ai-overlay__shimmer w-full max-w-md rounded-2xl border border-white/[0.12] bg-[var(--color-ink-900)]/75 p-8 text-center shadow-[var(--shadow-xl)] ring-1 ring-white/[0.06]">
          <div className="relative mx-auto mb-7 h-32 w-32">
            <div
              className="board-ai-overlay__ring absolute inset-0 rounded-full p-[3px]"
              style={{
                background: 'conic-gradient(from 0deg, #6366f1, #a78bfa, #38bdf8, #818cf8, #6366f1)',
              }}
            >
              <div className="board-ai-overlay__core flex h-full w-full items-center justify-center rounded-full bg-[var(--color-ink-900)]">
                <Sparkles
                  className="h-11 w-11 text-[var(--color-primary-300)]"
                  strokeWidth={1.25}
                  aria-hidden
                />
              </div>
            </div>
          </div>
          <h2
            id="board-ai-overlay-title"
            className="font-display text-xl font-semibold tracking-tight text-white sm:text-2xl"
          >
            {text.title}
          </h2>
          <p
            id="board-ai-overlay-desc"
            className="mt-3 text-sm leading-relaxed text-[var(--color-ink-300)]"
          >
            {text.body}
          </p>
          <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
            <span className="board-ai-overlay__dot h-2 w-2 rounded-full bg-[var(--color-primary-400)]" />
            <span className="board-ai-overlay__dot h-2 w-2 rounded-full bg-[var(--color-primary-400)]" />
            <span className="board-ai-overlay__dot h-2 w-2 rounded-full bg-[var(--color-primary-400)]" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
