import { LIBRARY_SUBJECT_FILTER_LABELS } from '../features/boards/lib/libraryCatalogFilters';
import { cn } from '../lib/cn';

export function CatalogSubjectSelect({
  id,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
  'aria-required': ariaRequired,
  emptyLabel = 'Bitte wählen …',
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
  'aria-label'?: string;
  'aria-required'?: boolean;
  /** Option „—“ für Boards mit leerem Fach beim ersten Sync — Smartboards sollten später ein konkretes Fach wählen. */
  emptyLabel?: string;
}) {
  const trim = value.trim();
  const extra = trim && !LIBRARY_SUBJECT_FILTER_LABELS.includes(trim) ? trim : null;

  return (
    <select
      id={id}
      className={cn(className)}
      value={trim}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      aria-required={ariaRequired}
    >
      <option value="">{emptyLabel}</option>
      {extra ? (
        <option value={extra}>
          {extra} (nicht in Filterliste)
        </option>
      ) : null}
      {LIBRARY_SUBJECT_FILTER_LABELS.map((label) => (
        <option key={label} value={label}>
          {label}
        </option>
      ))}
    </select>
  );
}
