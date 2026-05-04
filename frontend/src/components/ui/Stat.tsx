import type { ReactNode } from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Card } from './Card';

export type StatTone = 'primary' | 'success' | 'accent' | 'neutral';

const TONE_STYLES: Record<StatTone, { bg: string; fg: string; bd: string }> = {
  primary: { bg: 'bg-indigo-50', fg: 'text-indigo-700', bd: 'border-indigo-100' },
  success: { bg: 'bg-emerald-50', fg: 'text-emerald-700', bd: 'border-emerald-200' },
  accent: { bg: 'bg-amber-50', fg: 'text-amber-700', bd: 'border-amber-200' },
  neutral: { bg: 'bg-slate-100', fg: 'text-slate-700', bd: 'border-slate-200' },
};

export type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
  className?: string;
};

export const StatCard = ({ label, value, hint, icon: Icon, tone = 'primary', className }: StatCardProps) => {
  const t = TONE_STYLES[tone];
  return (
    <Card className={className}>
      <div className="mb-2 flex items-center justify-between">
        <div className={cn('grid h-9 w-9 place-items-center rounded-[10px] border', t.bg, t.fg, t.bd)}>
          <Icon size={18} aria-hidden />
        </div>
        {hint && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <ArrowUpRight size={11} aria-hidden /> {hint}
          </span>
        )}
      </div>
      <div className="text-[28px] font-bold tracking-tight text-slate-900">{value}</div>
      <div className="mt-0.5 text-[13px] text-slate-600">{label}</div>
    </Card>
  );
};
