import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { fetchBoardStudentPresence } from '../boardsApi';
import { BOARDS_STUDENT_PRESENCE_QUERY_KEY } from '../../../lib/listQueries';
import { cn } from '../../../lib/cn';

type BoardStudentPresenceBadgeProps = {
  boardId: string;
  /** Polling nur wenn Schüler-Link aktiv */
  enabled: boolean;
  className?: string;
  variant?: 'dark' | 'light';
};

export const BoardStudentPresenceBadge = ({
  boardId,
  enabled,
  className,
  variant = 'dark',
}: BoardStudentPresenceBadgeProps) => {
  const { data, isError } = useQuery({
    queryKey: BOARDS_STUDENT_PRESENCE_QUERY_KEY(boardId),
    queryFn: () => fetchBoardStudentPresence(boardId),
    enabled: enabled && Boolean(boardId),
    refetchInterval: enabled ? 3000 : false,
    placeholderData: (previousData) => previousData,
  });

  if (!enabled || isError) return null;

  const n = data?.connected ?? 0;
  const label =
    n === 0
      ? 'Geschätzte Geräte mit offenem Link — Zahl wird live aktualisiert'
      : n === 1
        ? '1 geschätztes Gerät mit offenem Link — live'
        : `${n} geschätzte Geräte mit offenem Link — live`;

  const base =
    variant === 'dark'
      ? 'border-white/12 bg-white/[0.07] text-white/88'
      : 'border-slate-200/90 bg-white/80 text-slate-700 shadow-sm shadow-slate-900/[0.03] backdrop-blur-sm';

  return (
    <span
      className={cn(
        'inline-flex max-w-[14rem] items-center gap-2 rounded-full border px-2.5 py-1 sm:max-w-none',
        base,
        className,
      )}
      title={label}
      aria-live="polite"
    >
      <span className="inline-flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
        <motion.span
          className={cn(
            'block h-2 w-2 rounded-full',
            variant === 'dark'
              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.35)]'
              : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.3)]',
          )}
          animate={{ opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </span>
      <span className="flex items-baseline gap-0.5 text-[11px] font-medium leading-none sm:text-xs">
        <span className="tabular-nums tracking-tight">{n}</span>
        <span
          className={cn(
            'text-[10px] font-medium tracking-wide sm:text-[11px]',
            variant === 'dark' ? 'text-white/50' : 'text-slate-500',
          )}
        >
          live
        </span>
      </span>
    </span>
  );
};
