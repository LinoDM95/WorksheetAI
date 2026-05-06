import { cn } from '../lib/cn';

type LogoProps = {
  compact?: boolean;
  className?: string;
  /** Weglassen: „Lehrer-Cockpit“. `false` / `null` / `''`: keine zweite Zeile (z. B. Schüler-Lobby). */
  tagline?: string | false | null;
};

/**
 * WorksheetAI Wordmark + Mini-Icon.
 * Übernommen aus design/icons.jsx, in Tailwind übersetzt.
 */
export const Logo = ({ compact = false, className, tagline }: LogoProps) => {
  const subtitle =
    tagline === undefined ? 'Lehrer-Cockpit' : tagline === false || tagline === null || tagline === '' ? null : tagline;

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <div
        className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px]"
        style={{
          background: 'linear-gradient(160deg, #4f46e5, #6366f1)',
          boxShadow:
            '0 1px 0 rgba(255,255,255,0.3) inset, 0 4px 8px -2px rgba(67,56,202,0.45)',
        }}
        aria-hidden
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="3" width="14" height="18" rx="2" fill="#fff" opacity="0.92" />
          <path d="M9 9h6M9 12h6M9 15h4" stroke="#4338ca" strokeWidth="1.6" strokeLinecap="round" />
          <path
            d="m14.5 17.6 1.6 1.6 3-3.5"
            stroke="#10b981"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      <div
        className={cn(
          'min-w-0 overflow-hidden transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none motion-reduce:duration-0',
          compact ? 'max-w-0 opacity-0' : 'max-w-[min(13rem,42vw)] opacity-100 sm:max-w-[15rem]',
        )}
      >
        <div className="leading-tight whitespace-nowrap pr-0.5">
          <div className="text-base font-bold tracking-tight text-slate-900">
            Worksheet<span className="text-indigo-600">AI</span>
          </div>
          {subtitle ? (
            <div className="mt-px text-[11px] font-medium text-slate-500">{subtitle}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
