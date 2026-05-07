import { Clock } from 'lucide-react';

/** Kompakte Anzeige der geplanten Unterrichts-/Bearbeitungsdauer (Minuten), z. B. in der Bibliothek. */
export function LibraryPlannedDuration({ minutes }: { minutes?: number | null }) {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const m = Math.round(minutes);
  return (
    <span
      className="inline-flex items-center gap-1 tabular-nums text-slate-600"
      title="Geplante Dauer"
    >
      <Clock size={12} strokeWidth={2} className="shrink-0 text-slate-400" aria-hidden />
      <span>{m} Min.</span>
    </span>
  );
}
