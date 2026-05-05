import { Plus, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { BlockRegistryEntry, CompositionPlan } from '../types';
import { BLOCKS_MAX_PAGES, BLOCKS_PAGE_BLOCK_LIMIT, BLOCKS_PAGE_UNIT_BUDGET } from '../types';
import { pageUnitsUsed } from './useBoardBuilderState';

type Props = {
  plan: CompositionPlan;
  pageIndex: number;
  registry: BlockRegistryEntry[];
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
};

export const PagesRail = ({ plan, pageIndex, registry, onSelect, onAdd, onRemove }: Props) => {
  const canAddPage = plan.pages.length < BLOCKS_MAX_PAGES;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Seiten</div>
        <span className="text-[11px] text-slate-400">{plan.pages.length} / {BLOCKS_MAX_PAGES}</span>
      </div>
      <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
        {plan.pages.map((p, i) => {
          const units = pageUnitsUsed(p, registry);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                'group relative flex h-20 w-32 shrink-0 flex-col justify-between rounded-lg border bg-slate-50 p-2 text-left transition',
                i === pageIndex
                  ? 'border-indigo-500 ring-2 ring-indigo-200'
                  : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold text-slate-700">Seite {i + 1}</span>
                <span className="text-[10px] text-slate-400">{p.block_slots.length}/{BLOCKS_PAGE_BLOCK_LIMIT}</span>
              </div>
              <div className="text-[11px] leading-tight text-slate-500">{p.title || '—'}</div>
              <div className="flex items-center gap-1">
                {p.block_slots.slice(0, 4).map((_, j) => (
                  <span key={j} className="h-1.5 flex-1 rounded-full bg-indigo-200" aria-hidden />
                ))}
                {Array.from({ length: Math.max(0, 4 - p.block_slots.length) }).map((_, j) => (
                  <span key={`e${j}`} className="h-1.5 flex-1 rounded-full bg-slate-200" aria-hidden />
                ))}
              </div>
              <span className={cn('absolute right-1 top-1 text-[10px]', units > BLOCKS_PAGE_UNIT_BUDGET ? 'text-rose-600' : 'text-slate-400')}>
                {units}/{BLOCKS_PAGE_UNIT_BUDGET}u
              </span>
              {plan.pages.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRemove(i); } }}
                  className="absolute -right-1 -top-1 hidden h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-white text-rose-500 shadow group-hover:flex"
                  aria-label={`Seite ${i + 1} entfernen`}
                >
                  <Trash2 size={12} aria-hidden />
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAddPage}
          className={cn(
            'flex h-20 w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs font-medium transition',
            canAddPage
              ? 'border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600'
              : 'cursor-not-allowed border-slate-200 text-slate-300',
          )}
        >
          <Plus size={14} aria-hidden /> Seite
        </button>
      </div>
    </div>
  );
};
