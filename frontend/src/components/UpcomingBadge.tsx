import { Clock } from 'lucide-react';
import { cn } from '../lib/cn';

/** Anthrazit-Pill mit Uhr (Vorlagen- & Schnellaktion-Karten, einheitlich). */
export const UpcomingBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full bg-gray-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm',
      className,
    )}
    aria-hidden
  >
    <Clock size={11} strokeWidth={2.25} aria-hidden /> Demnächst
  </span>
);
