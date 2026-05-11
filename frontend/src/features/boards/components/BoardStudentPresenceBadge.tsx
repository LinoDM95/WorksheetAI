import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
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
    refetchInterval: enabled ? 5000 : false,
  });

  if (!enabled || isError) return null;

  const n = data?.connected ?? 0;
  const label =
    n === 0
      ? 'Noch keine Schüler-Geräte (geschätzt)'
      : n === 1
        ? '1 Gerät mit offenem Link (geschätzt)'
        : `${n} Geräte mit offenem Link (geschätzt)`;

  const base =
    variant === 'dark'
      ? 'border-white/15 bg-white/10 text-white/90'
      : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span
      className={cn(
        'inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[11px] font-medium sm:max-w-none sm:text-xs',
        base,
        className,
      )}
      title={label}
      aria-live="polite"
    >
      <Users size={13} className="shrink-0 opacity-80" aria-hidden />
      <span className="tabular-nums">{n}</span>
      <span className="hidden sm:inline">Geräte</span>
    </span>
  );
};
