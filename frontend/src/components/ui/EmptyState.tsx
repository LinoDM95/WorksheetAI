import type { ReactNode } from 'react';
import { Card } from './Card';

export type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

/**
 * Einheitliche Darstellung leerer Listen / „noch nichts angelegt“-Zustände.
 */
export const EmptyState = ({ title, description, action, icon, className }: EmptyStateProps) => (
  <Card className={className}>
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      {icon}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action}
    </div>
  </Card>
);
