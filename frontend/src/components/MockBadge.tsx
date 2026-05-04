import { Construction } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Markiert UI-Bereiche, die noch reine Mockups sind (kein echtes Backend).
 * Drei Varianten:
 *   - "banner"  : kleines gelbes Pill-Banner über dem Element.
 *   - "overlay" : ganzer Bereich erhält Streifenmuster + Disabled-Optik + Tooltip.
 *   - "inline"  : winziges Inline-Pill, z. B. für einzelne Buttons.
 *
 * Die Markierungen sind zentral hier definiert, damit man sie später
 * mit einem einzigen Refactor entfernen kann, sobald das Backend folgt.
 */
export type MockBadgeProps = {
  variant?: 'banner' | 'overlay' | 'inline';
  label?: string;
  /** Tooltip-Text, der bei Hover/Fokus angezeigt wird. */
  tooltip?: string;
  className?: string;
  children?: ReactNode;
};

const DEFAULT_LABEL = 'Mockup — noch nicht funktional';

export const MockBadge = ({
  variant = 'banner',
  label = DEFAULT_LABEL,
  tooltip,
  className,
  children,
}: MockBadgeProps) => {
  const title = tooltip ?? label;

  if (variant === 'inline') {
    return (
      <span
        className={cn(
          'mock-banner pointer-events-auto inline-flex select-none items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider',
          className,
        )}
        title={title}
        aria-label={`Mockup-Bereich: ${label}`}
      >
        <Construction size={10} aria-hidden /> Mock
      </span>
    );
  }

  if (variant === 'overlay') {
    return (
      <div className={cn('mock-overlay relative', className)} title={title}>
        <div className="pointer-events-none absolute right-3 top-3 z-10">
          <span className="mock-banner shadow-sm" aria-label={`Mockup-Bereich: ${label}`}>
            <Construction size={12} aria-hidden /> {label}
          </span>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center', className)} title={title}>
      <span className="mock-banner" aria-label={`Mockup-Bereich: ${label}`}>
        <Construction size={12} aria-hidden /> {label}
      </span>
    </div>
  );
};
