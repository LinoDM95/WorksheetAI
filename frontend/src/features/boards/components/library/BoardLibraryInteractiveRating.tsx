import { useState, type FocusEvent } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../../../lib/cn';

const RATING_STAR_PX = 20;

export function BoardLibraryInteractiveRating({
  avgRating,
  ratingCount,
  myStars,
  disabled,
  onPick,
}: {
  avgRating: number | null | undefined;
  ratingCount: number;
  myStars: number | null | undefined;
  disabled: boolean;
  onPick: (stars: number) => void;
}) {
  const [hoverTier, setHoverTier] = useState<number | null>(null);
  const previewMode = hoverTier !== null;
  const avg = avgRating != null ? Math.min(5, Math.max(0, avgRating)) : 0;

  const avgLabel =
    avgRating != null ? `Community-Durchschnitt ${avgRating.toFixed(1)} von 5 Sternen` : 'Noch keine Community-Bewertung';
  const hint =
    myStars != null ? 'Deine Bewertung kann mit Klick auf die Sterne geändert werden.' : 'Mit der Maus über die Sterne fahren oder fokussieren, dann Stern klicken.';

  const handleBlurStar = (e: FocusEvent<HTMLButtonElement>) => {
    const next = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    const row = e.currentTarget.closest('[data-library-rating-row]');
    if (!next || !(row instanceof HTMLElement) || !row.contains(next)) setHoverTier(null);
  };

  return (
    <div
      className="rounded-[var(--radius-md)] outline-none focus-within:ring-2 focus-within:ring-indigo-400 focus-within:ring-offset-2 focus-within:ring-offset-[var(--color-bg-muted)]"
      role="group"
      aria-label={[avgLabel, hint].join(' ')}
      data-library-rating-row=""
      onMouseLeave={() => setHoverTier(null)}
    >
      <div className="flex w-fit items-center gap-px">
        {[1, 2, 3, 4, 5].map((tier) => {
          const frac = Math.min(1, Math.max(0, avg - (tier - 1)));
          const goldInPreview = previewMode && hoverTier != null && tier <= hoverTier;

          return (
            <button
              key={tier}
              type="button"
              disabled={disabled}
              aria-label={`${tier} von 5 Sternen vergeben`}
              aria-current={myStars === tier ? 'true' : undefined}
              className={cn(
                'rounded-md p-0.5 transition-[transform] duration-150 ease-out hover:enabled:scale-105 focus-visible:z-10 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
              )}
              onMouseEnter={() => setHoverTier(tier)}
              onFocus={() => setHoverTier(tier)}
              onBlur={handleBlurStar}
              onClick={() => onPick(tier)}
            >
              <span className="relative block shrink-0" style={{ width: RATING_STAR_PX, height: RATING_STAR_PX }}>
                <Star
                  size={RATING_STAR_PX}
                  strokeWidth={1.35}
                  className="absolute left-0 top-0 text-[var(--color-ink-200)] fill-[var(--color-ink-50)]"
                  aria-hidden
                />
                {!previewMode ? (
                  <span
                    className="absolute left-0 top-0 overflow-hidden transition-[width] duration-200 ease-out"
                    style={{ height: RATING_STAR_PX, width: `${frac * 100}%` }}
                  >
                    <Star
                      size={RATING_STAR_PX}
                      strokeWidth={1.35}
                      className="text-amber-500 fill-amber-400 transition-[opacity] duration-200"
                      aria-hidden
                    />
                  </span>
                ) : goldInPreview ? (
                  <Star
                    size={RATING_STAR_PX}
                    strokeWidth={1.35}
                    className="absolute left-0 top-0 text-amber-500 fill-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.45)] transition-[opacity,transform,color,fill] duration-200 ease-out"
                    aria-hidden
                  />
                ) : (
                  <Star
                    size={RATING_STAR_PX}
                    strokeWidth={1.35}
                    className="absolute left-0 top-0 text-[var(--color-ink-200)] fill-[var(--color-ink-100)] opacity-95 transition-[opacity,color,fill] duration-200"
                    aria-hidden
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-1 text-xs text-[var(--color-ink-600)] transition-opacity duration-150">
        {previewMode ? (
          <span className="font-medium text-[var(--color-ink-800)]">{hoverTier} Sterne vergeben?</span>
        ) : avgRating != null ? (
          <>
            <span className="font-semibold text-[var(--color-ink-800)]">{avgRating.toFixed(1)}</span> Ø ·{' '}
            {ratingCount} Bewertung{ratingCount === 1 ? '' : 'en'}
            {myStars != null ? (
              <span className="text-[var(--color-ink-500)]"> · Deine Note: {myStars}</span>
            ) : null}
          </>
        ) : (
          <>
            Noch keine Ø-Bewertung
            {myStars != null ? (
              <span className="text-[var(--color-ink-500)]"> · Deine Note: {myStars}</span>
            ) : (
              <> — mit den Sternen bewerten</>
            )}
          </>
        )}
      </p>
    </div>
  );
}
