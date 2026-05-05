import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { BlockCategory, BlockRegistryEntry } from '../types';

type Props = {
  blocks: BlockRegistryEntry[];
  categories: BlockCategory[];
  canAdd: (block: BlockRegistryEntry) => boolean;
  onAdd: (block: BlockRegistryEntry) => void;
};

export const BlockLibraryPanel = ({ blocks, categories, canAdd, onAdd }: Props) => {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blocks.filter((b) => {
      const matchCat = activeCat === 'all' || b.category === activeCat;
      const matchQ = !q || b.label.toLowerCase().includes(q) || b.help_text.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [activeCat, blocks, query]);

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3 border-r border-slate-200 bg-slate-50 p-3">
      <div className="relative">
        <Search aria-hidden size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          aria-label="Bausteine suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Bausteine suchen…"
          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <CategoryChip label="Alle" active={activeCat === 'all'} onClick={() => setActiveCat('all')} />
        {categories.map((c) => (
          <CategoryChip key={c.id} label={c.label} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-2">
          {filtered.map((b) => {
            const allowed = canAdd(b);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={!allowed}
                  onClick={() => onAdd(b)}
                  className={cn(
                    'group flex w-full flex-col gap-0.5 rounded-xl border bg-white p-3 text-left transition',
                    allowed
                      ? 'border-slate-200 hover:border-indigo-400 hover:shadow-sm'
                      : 'cursor-not-allowed border-slate-200 opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{b.label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {b.size_weight === 1 ? 'S' : b.size_weight === 2 ? 'M' : 'L'}
                    </span>
                  </div>
                  <span className="text-xs leading-snug text-slate-500">{b.help_text}</span>
                  {allowed && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100">
                      <Plus size={12} aria-hidden /> Zur Seite hinzufügen
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
              Keine Bausteine gefunden.
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
};

const CategoryChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-full px-2.5 py-1 text-[11px] font-medium transition',
      active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-200',
    )}
  >
    {label}
  </button>
);
