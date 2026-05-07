import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';

export type FieldProps = {
  label?: string;
  help?: string;
  error?: string;
  /** Zeigt ein rotes Sternchen neben dem Label (Pflichtfeld-Hinweis). */
  required?: boolean;
  /** Optionaler Spalten-Span im Wizard-Grid. */
  span?: 1 | 2 | 3;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
};

export const Field = ({
  label,
  help,
  error,
  required,
  span = 1,
  htmlFor,
  className,
  children,
}: FieldProps) => (
  <div
    className={cn(
      'min-w-0',
      span === 2 && 'sm:col-span-2',
      span === 3 && 'sm:col-span-3',
      className,
    )}
  >
    {label && (
      <label className="field-label" htmlFor={htmlFor}>
        <span>{label}</span>
        {required ? (
          <abbr title="Pflichtfeld" className="ml-0.5 cursor-help font-semibold text-red-600 no-underline">
            *
          </abbr>
        ) : null}
      </label>
    )}
    {children}
    {error ? (
      <div className="mt-1.5 text-[12px] text-red-700">{error}</div>
    ) : help ? (
      <div className="field-help">{help}</div>
    ) : null}
  </div>
);

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ className, invalid, ...rest }, ref) => (
    <input
      ref={ref}
      {...rest}
      className={cn(
        'input',
        invalid && 'border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.18)]',
        className,
      )}
    />
  ),
);
TextInput.displayName = 'TextInput';

export type SearchInputProps = Omit<TextInputProps, 'type'> & {
  containerClassName?: string;
  iconSize?: number;
};

/**
 * Such-Eingabe mit Icon, einheitlich für Listen-Filter.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ containerClassName, iconSize = 15, className, ...rest }, ref) => (
    <div className={cn('relative min-w-[200px] flex-1', containerClassName)}>
      <Search
        size={iconSize}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <TextInput ref={ref} type="search" {...rest} className={cn('!pl-11', className)} />
    </div>
  ),
);
SearchInput.displayName = 'SearchInput';
