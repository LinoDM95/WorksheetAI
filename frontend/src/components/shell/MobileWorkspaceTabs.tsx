import { cn } from '../../lib/cn';

export type WorkspaceMobileTab = 'list' | 'content';

type MobileWorkspaceTabsProps = {
  value: WorkspaceMobileTab;
  onChange: (v: WorkspaceMobileTab) => void;
  contentDisabled?: boolean;
  listLabel?: string;
  contentLabel?: string;
  className?: string;
};

export function MobileWorkspaceTabs({
  value,
  onChange,
  contentDisabled,
  listLabel = 'Liste',
  contentLabel = 'Bearbeitung',
  className,
}: MobileWorkspaceTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Ansicht wechseln"
      className={cn(
        'flex shrink-0 gap-1 border-b border-slate-200 bg-[var(--color-bg-card)] px-2 py-2 lg:hidden',
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'list'}
        className={cn(
          'min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
          value === 'list' ? 'bg-indigo-50 text-indigo-900' : 'text-slate-600 hover:bg-slate-50',
        )}
        onClick={() => onChange('list')}
      >
        {listLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'content'}
        disabled={contentDisabled}
        className={cn(
          'min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
          value === 'content' ? 'bg-indigo-50 text-indigo-900' : 'text-slate-600 hover:bg-slate-50',
          contentDisabled && 'cursor-not-allowed opacity-45',
        )}
        onClick={() => {
          if (!contentDisabled) onChange('content');
        }}
      >
        {contentLabel}
      </button>
    </div>
  );
}
