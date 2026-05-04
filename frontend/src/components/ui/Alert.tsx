import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../../lib/cn';

export type AlertTone = 'info' | 'success' | 'warn' | 'error';

const TONE_STYLES: Record<AlertTone, { box: string; icon: typeof Info }> = {
  info: { box: 'border-indigo-200 bg-indigo-50 text-indigo-900', icon: Info },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
  warn: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle },
  error: { box: 'border-red-200 bg-red-50 text-red-900', icon: AlertCircle },
};

export type AlertProps = {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
};

export const Alert = ({ tone = 'info', title, children, className }: AlertProps) => {
  const t = TONE_STYLES[tone];
  const Icon = t.icon;
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', t.box, className)} role="alert">
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
};
