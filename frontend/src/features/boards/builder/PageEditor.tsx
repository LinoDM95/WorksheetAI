import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown, ArrowUp, Sparkles, Trash2 } from 'lucide-react';
import type { BlockRegistryEntry, BlockSlot, PagePlan } from '../types';
import {
  BLOCKS_MAX_BULLET_LEN,
  BLOCKS_MAX_PAGE_BULLETS,
  BLOCKS_PAGE_BLOCK_LIMIT,
  BLOCKS_PAGE_UNIT_BUDGET,
} from '../types';
import { Field, IconButton, TextInput } from '../../../components/ui';
import { pageUnitsUsed } from './useBoardBuilderState';
import { cn } from '../../../lib/cn';

type Props = {
  page: PagePlan;
  pageIndex: number;
  registry: BlockRegistryEntry[];
  onTitleChange: (value: string) => void;
  onBulletsChange: (bullets: string[]) => void;
  onSlotMove: (instanceId: string, direction: -1 | 1) => void;
  onSlotRemove: (instanceId: string) => void;
  onSlotHint: (instanceId: string, hint: string) => void;
};

export type PageEditorHandle = {
  /** Übernimmt den Entwurf in den Plan (onBlur; optional explizit). */
  flushBullets: () => void;
  /** Aktuelle Stichpunkte aus dem Textarea — für synchronen Submit / Seitenwechsel. */
  getBulletsSnapshot: () => string[];
};

const bulletsToText = (bullets: string[]): string => bullets.map((b) => `- ${b}`).join('\n');

const textToBullets = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•\-*]+/, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, BLOCKS_MAX_BULLET_LEN))
    .slice(0, BLOCKS_MAX_PAGE_BULLETS);

export const PageEditor = forwardRef<PageEditorHandle, Props>(function PageEditor(
  {
    page,
    pageIndex,
    registry,
    onTitleChange,
    onBulletsChange,
    onSlotMove,
    onSlotRemove,
    onSlotHint,
  },
  ref,
) {
  const byId = useMemo(() => new Map(registry.map((b) => [b.id, b])), [registry]);
  const units = pageUnitsUsed(page, registry);
  const slotCount = page.block_slots.length;

  const [draft, setDraft] = useState(() => bulletsToText(page.bullets));

  useEffect(() => {
    setDraft(bulletsToText(page.bullets));
  }, [pageIndex, page.bullets]);

  const flushBullets = useCallback(() => {
    onBulletsChange(textToBullets(draft));
  }, [draft, onBulletsChange]);

  useImperativeHandle(
    ref,
    () => ({
      flushBullets,
      getBulletsSnapshot: () => textToBullets(draft),
    }),
    [draft, flushBullets],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-slate-50 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Seitentitel" className="min-w-[220px] flex-1">
          <TextInput
            value={page.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={`Seite ${pageIndex + 1}`}
          />
        </Field>
        <div className="flex shrink-0 items-center gap-2 self-end pb-1 text-[11px] text-slate-500">
          <span>
            Bausteine <strong className="text-slate-700">{slotCount}/{BLOCKS_PAGE_BLOCK_LIMIT}</strong>
          </span>
          <span>·</span>
          <span className={cn(units > BLOCKS_PAGE_UNIT_BUDGET ? 'text-rose-600' : '')}>
            Layout-Budget <strong className="text-slate-700">{units}/{BLOCKS_PAGE_UNIT_BUDGET}</strong>
          </span>
        </div>
      </div>

      <Field
        label={`Themen-Stichpunkte für diese Seite (max. ${BLOCKS_MAX_PAGE_BULLETS} Zeilen, je ${BLOCKS_MAX_BULLET_LEN} Zeichen)`}
        help="Pro Zeile ein Stichpunkt (optional mit - am Anfang). Übernahme beim Verlassen des Feldes, beim Seitenwechsel oder beim finalen Erzeugen."
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={flushBullets}
          rows={Math.max(5, Math.min(10, draft.split(/\r?\n/).length + 2))}
          placeholder={'- Was bedeutet Median?\n- Sortieren und Mitte finden\n- Beispiel an der Klasse'}
          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm leading-6 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          aria-label="Stichpunkte für diese Seite"
        />
        <div className="mt-1 text-[11px] text-slate-400">
          {textToBullets(draft).length} / {BLOCKS_MAX_PAGE_BULLETS} Stichpunkte (nach Trim)
        </div>
      </Field>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bausteine auf dieser Seite</h3>
          <span className="text-[11px] text-slate-400">Reihenfolge entspricht der späteren Anordnung</span>
        </div>

        {slotCount === 0 ? (
          <EmptySlotsHint />
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {page.block_slots.map((slot, i) => (
                <SlotCard
                  key={slot.instance_id}
                  slot={slot}
                  registryEntry={byId.get(slot.block_id)}
                  index={i}
                  total={slotCount}
                  onMove={(dir) => onSlotMove(slot.instance_id, dir)}
                  onRemove={() => onSlotRemove(slot.instance_id)}
                  onHint={(hint) => onSlotHint(slot.instance_id, hint)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
});

const EmptySlotsHint = () => (
  <div className="flex flex-col items-start gap-1 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
    <div className="flex items-center gap-2 font-medium text-slate-700">
      <Sparkles size={14} aria-hidden /> Noch keine Bausteine
    </div>
    <div className="text-xs text-slate-500">Wähle links Bausteine aus, dann füllt die KI sie aus deinen Stichpunkten.</div>
  </div>
);

const SlotCard = ({
  slot,
  registryEntry,
  index,
  total,
  onMove,
  onRemove,
  onHint,
}: {
  slot: BlockSlot;
  registryEntry: BlockRegistryEntry | undefined;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onHint: (hint: string) => void;
}) => {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="flex shrink-0 flex-col items-center gap-1 text-slate-400">
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600">
          {index + 1}
        </span>
        <IconButton size="sm" variant="ghost" aria-label="Nach oben" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp size={13} aria-hidden />
        </IconButton>
        <IconButton size="sm" variant="ghost" aria-label="Nach unten" disabled={index === total - 1} onClick={() => onMove(1)}>
          <ArrowDown size={13} aria-hidden />
        </IconButton>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">
            {registryEntry?.label ?? slot.block_id}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {registryEntry ? (registryEntry.size_weight === 1 ? 'S' : registryEntry.size_weight === 2 ? 'M' : 'L') : '?'}
          </span>
        </div>
        {registryEntry?.help_text && (
          <p className="text-[11px] leading-snug text-slate-500">{registryEntry.help_text}</p>
        )}
        <input
          type="text"
          value={slot.hint}
          onChange={(e) => onHint(e.target.value)}
          placeholder='Optionaler Hinweis nur für diesen Baustein (z. B. „Merksatz formulieren")'
          maxLength={200}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      <IconButton size="sm" variant="ghost" aria-label="Baustein entfernen" onClick={onRemove}>
        <Trash2 size={14} aria-hidden className="text-rose-500" />
      </IconButton>
    </motion.li>
  );
};
