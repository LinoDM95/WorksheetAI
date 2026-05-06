import type { RevisionMode } from '../../types';

export const REVISION_MODE_OPTIONS: { value: RevisionMode; label: string; hint: string }[] = [
  { value: 'general', label: 'Allgemein', hint: 'Beschreibe deinen Wunsch frei.' },
  { value: 'bug_fix', label: 'Fehler beheben', hint: 'Minimale Änderungen, Funktion reparieren.' },
  { value: 'design_improve', label: 'Design verbessern', hint: 'Visuelle Hierarchie, Farben, Komposition.' },
  { value: 'touch_optimize', label: 'Touch optimieren', hint: 'Pointer-Events, größere Flächen, kein Hover.' },
  { value: 'content_change', label: 'Inhalt ändern', hint: 'Fakten, Aufgaben, Texte präzisieren.' },
  { value: 'simplify', label: 'Vereinfachen', hint: 'Texte und Bedienung reduzieren.' },
  { value: 'make_more_creative', label: 'Kreativer machen', hint: 'Stärker umgestalten, neue Metapher erlaubt.' },
  { value: 'performance_improve', label: 'Performance', hint: 'Animationen und DOM reduzieren.' },
];

export type RevisionModeSelectProps = {
  value: RevisionMode;
  onChange: (mode: RevisionMode) => void;
  disabled?: boolean;
};

export function RevisionModeSelect({ value, onChange, disabled }: RevisionModeSelectProps) {
  const active = REVISION_MODE_OPTIONS.find((o) => o.value === value) ?? REVISION_MODE_OPTIONS[0];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="revision-mode" className="text-[12px] font-semibold text-slate-600">
        Revisionsmodus
      </label>
      <select
        id="revision-mode"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as RevisionMode)}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
      >
        {REVISION_MODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <p className="text-[11.5px] text-slate-500">{active.hint}</p>
    </div>
  );
}
