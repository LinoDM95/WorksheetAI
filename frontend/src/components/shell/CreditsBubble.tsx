import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../lib/authContext';
import { cn } from '../../lib/cn';

export const CreditsBubble = () => {
  const { user, bootstrapped } = useAuth();
  const reduceMotion = useReducedMotion();

  if (!bootstrapped || !user) return null;

  const cap = Math.max(1, user.credits_reference_cap ?? 10000);
  const bal = user.credits_balance ?? 0;
  const fillRatio = Math.min(1, Math.max(0, bal / cap));
  const fillPct = Math.round(fillRatio * 100);

  const labelExact = `${bal.toLocaleString('de-DE')} Credits`;

  return (
    <div className="relative shrink-0 overflow-visible">
      <button
        type="button"
        aria-label={`Credits — aktuell ${labelExact}, Bezugsgröße bis ${cap.toLocaleString('de-DE')} Credits.`}
        className={cn(
          'group relative z-[2] block h-11 w-11 shrink-0 overflow-visible rounded-full sm:h-12 sm:w-12',
          'shadow-[0_2px_10px_rgba(15,23,42,0.08)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400',
        )}
      >
        <div className="pointer-events-none absolute inset-0 rounded-full" aria-hidden>
          <div
            className={cn(
              'pointer-events-none absolute inset-0 rounded-full border border-white/90 shadow-sm',
              'bg-gradient-to-br from-white/55 via-indigo-100/35 to-violet-200/55',
              'backdrop-blur-[2px]',
            )}
          />
          <div className="pointer-events-none absolute inset-[5px] overflow-hidden rounded-full bg-white/15">
            <motion.div
              className={cn(
                'pointer-events-none absolute inset-x-0 bottom-0 credits-bubble-fill-shimmer',
                'bg-gradient-to-t from-indigo-600/85 via-violet-500/65 to-fuchsia-400/45',
              )}
              initial={false}
              animate={{ height: `${fillPct}%` }}
              transition={{
                duration: reduceMotion ? 0 : 0.75,
                ease: [0.33, 1, 0.68, 1],
              }}
            />
          </div>
          <div
            className={cn(
              'pointer-events-none absolute inset-[4px] rounded-full opacity-70',
              'bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.55),transparent_55%)]',
            )}
          />
          <div
            className={cn(
              'pointer-events-none absolute inset-[7px] rounded-full opacity-35 mix-blend-soft-light',
              'bg-[radial-gradient(circle_at_70%_72%,rgba(255,255,255,0.5),transparent_45%)]',
            )}
          />
        </div>

        <span
          className={cn(
            'pointer-events-none absolute left-1/2 top-full z-[100] mt-2 -translate-x-1/2 whitespace-nowrap',
            'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 shadow-md',
            'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
          aria-hidden
        >
          <span className="tabular-nums">{bal.toLocaleString('de-DE')}</span>{' '}
          <span className="font-medium text-slate-500">Credits</span>
        </span>
      </button>
    </div>
  );
};
