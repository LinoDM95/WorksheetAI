import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Field, type FieldProps } from '../../components/ui';

/**
 * Wizard-Field-Alias auf das gemeinsame `<Field>`-Primitive.
 * Bleibt als Re-Export, damit bestehende Wizard-Steps (`<FieldRow>`) ohne
 * weitere Änderung weiterlaufen — alle Neuentwicklungen nutzen `<Field>`.
 */
export const FieldRow = (props: FieldProps) => <Field {...props} />;

/** Schritt-Indikator oben in der Wizard-Topbar. */
export const Stepper = ({
  step,
  steps,
  onStepClick,
}: {
  step: number;
  steps: string[];
  onStepClick?: (index: number) => void;
}) => (
  <ol className="flex flex-wrap items-center gap-y-3 px-1">
    {steps.map((s, i) => {
      const state = i < step ? 'done' : i === step ? 'active' : '';
      const interactive = onStepClick && i <= step;
      const Tag = interactive ? 'button' : 'div';
      return (
        <li key={s} className="flex flex-1 items-center gap-3 text-left last:flex-initial">
          <Tag
            type={interactive ? 'button' : undefined}
            onClick={interactive ? () => onStepClick?.(i) : undefined}
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5',
              interactive && 'cursor-pointer hover:bg-slate-50',
            )}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <span className={cn('stepper-dot', state)} aria-hidden>
              {i < step ? <Check size={14} /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                Schritt {i + 1}
              </span>
              <span
                className={cn(
                  'block truncate text-[13px]',
                  state === 'active'
                    ? 'font-bold text-indigo-700'
                    : state === 'done'
                      ? 'font-semibold text-slate-700'
                      : 'font-medium text-slate-500',
                )}
              >
                {s}
              </span>
            </span>
          </Tag>
          {i < steps.length - 1 && (
            <span
              className={cn(
                'mx-2 hidden h-px min-w-[24px] flex-1 sm:block',
                i < step ? 'bg-emerald-500' : 'bg-slate-300',
              )}
              aria-hidden
            />
          )}
        </li>
      );
    })}
  </ol>
);

/** Radio-Card-Gruppe (klickbare Optionen mit Untertitel). */
export const RadioGroup = <T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { id: T; label: string; sub?: string; swatch?: string[] }[];
  value: T;
  onChange: (id: T) => void;
  columns?: 1 | 2 | 3 | 4;
}) => {
  const grid = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }[columns];
  return (
    <div className={cn('grid gap-2', grid)} role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className="radio-card"
          role="radio"
          aria-checked={value === opt.id}
          onClick={() => onChange(opt.id)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-slate-900">{opt.label}</div>
              {opt.sub && <div className="mt-px text-[11.5px] text-slate-500">{opt.sub}</div>}
            </div>
            {opt.swatch && (
              <div className="flex shrink-0 gap-0.5">
                {opt.swatch.map((c, i) => (
                  <span
                    key={i}
                    className="h-3.5 w-3.5 rounded-[4px] border border-slate-900/10"
                    style={{ background: c }}
                  />
                ))}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
};

/** Kleine Section-Heading-Komponente im Karten-Inneren. */
export const SectionHeading = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-slate-700">
    {children}
  </h3>
);
