import type { HTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getWorksheetStatusInfo } from '../../lib/worksheetStatus';

export type BadgeTone = 'primary' | 'success' | 'accent' | 'warn' | 'neutral';

const TONE_CLASS: Record<BadgeTone, string> = {
  primary: 'badge-primary',
  success: 'badge-success',
  accent: 'badge-accent',
  warn: 'badge-warn',
  neutral: 'badge-neutral',
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  withDot?: boolean;
  leftIcon?: ReactNode;
  children: ReactNode;
};

export const Badge = ({
  tone = 'neutral',
  withDot = false,
  leftIcon,
  className,
  children,
  ...rest
}: BadgeProps) => (
  <span {...rest} className={cn('badge', TONE_CLASS[tone], withDot && 'badge-dot', className)}>
    {leftIcon}
    {children}
  </span>
);

/** Domain-Badge: nutzt die zentrale Status-Map aus `lib/worksheetStatus.ts`. */
export const StatusBadge = ({ status, className }: { status?: string; className?: string }) => {
  const info = getWorksheetStatusInfo(status);
  return (
    <Badge tone={info.tone} className={className} leftIcon={info.hasCheck ? <Check size={11} aria-hidden /> : undefined}>
      {info.label}
    </Badge>
  );
};
