import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Entfernt Padding für Listen-Layouts mit Trennlinien. */
  flush?: boolean;
  /** Versteckt Overflow auf dem Container (für divide-y oder runde Ecken). */
  overflowHidden?: boolean;
};

export const Card = ({
  flush = false,
  overflowHidden = false,
  className,
  children,
  ...rest
}: CardProps) => (
  <div
    {...rest}
    className={cn('card', overflowHidden && 'overflow-hidden', !flush && 'p-4 sm:p-5', className)}
  >
    {children}
  </div>
);

export const CardHeader = ({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) => (
  <div className={cn('flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4', className)}>
    <div className="min-w-0">
      <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
      {description && <p className="mt-0.5 text-[12.5px] text-slate-500">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
  </div>
);

/**
 * Karte mit eingebautem Header — der häufigste Anwendungsfall.
 * Inhalts-Padding ist hier 0, damit Listen mit `divide-y` durchgehen können.
 */
export const SectionCard = ({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) => (
  <Card flush overflowHidden className={className}>
    <CardHeader title={title} description={description} actions={actions} />
    <div className={bodyClassName}>{children}</div>
  </Card>
);
