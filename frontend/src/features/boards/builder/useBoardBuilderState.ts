import { useReducer } from 'react';
import type {
  BlockRegistryEntry,
  BlockSlot,
  CompositionPlan,
  PagePlan,
} from '../types';
import {
  BLOCKS_MAX_BULLET_LEN,
  BLOCKS_MAX_PAGE_BULLETS,
  BLOCKS_MAX_PAGES,
  BLOCKS_PAGE_BLOCK_LIMIT,
  BLOCKS_PAGE_UNIT_BUDGET,
} from '../types';

export type BuilderState = {
  plan: CompositionPlan;
  pageIndex: number;
};

export type BuilderAction =
  | { type: 'set_meta'; field: 'subject' | 'grade' | 'topic' | 'title' | 'style_hint' | 'theme_id'; value: string }
  | { type: 'add_page' }
  | { type: 'remove_page'; pageIndex: number }
  | { type: 'select_page'; pageIndex: number }
  | { type: 'set_page_title'; pageIndex: number; title: string }
  | { type: 'set_page_bullets'; pageIndex: number; bullets: string[] }
  | { type: 'add_slot'; pageIndex: number; block: BlockRegistryEntry }
  | { type: 'remove_slot'; pageIndex: number; instanceId: string }
  | { type: 'move_slot'; pageIndex: number; instanceId: string; direction: -1 | 1 }
  | { type: 'set_slot_hint'; pageIndex: number; instanceId: string; hint: string };

let _counter = 0;
const nextInstanceId = (blockId: string) => {
  _counter += 1;
  return `${blockId}-${Date.now().toString(36)}-${_counter}`;
};
export const __resetBuilderInstanceCounter = (seed = 0) => {
  _counter = seed;
};

export const sizeWeightOf = (block: BlockRegistryEntry | undefined): number =>
  Number(block?.size_weight) || 1;

export const pageUnitsUsed = (page: PagePlan, registry: BlockRegistryEntry[]): number => {
  const byId = new Map(registry.map((b) => [b.id, b]));
  return page.block_slots.reduce((sum, slot) => sum + sizeWeightOf(byId.get(slot.block_id)), 0);
};

export const canAddSlot = (page: PagePlan, registry: BlockRegistryEntry[], block: BlockRegistryEntry): boolean => {
  if (page.block_slots.length >= BLOCKS_PAGE_BLOCK_LIMIT) return false;
  if (pageUnitsUsed(page, registry) + sizeWeightOf(block) > BLOCKS_PAGE_UNIT_BUDGET) return false;
  return true;
};

export const canAddPage = (plan: CompositionPlan): boolean => plan.pages.length < BLOCKS_MAX_PAGES;

export const emptyPage = (title = 'Neue Seite'): PagePlan => ({
  title,
  bullets: [],
  block_slots: [],
});

export const initialBuilderState = (preset?: Partial<CompositionPlan>): BuilderState => ({
  plan: {
    subject: preset?.subject ?? '',
    grade: preset?.grade ?? '',
    topic: preset?.topic ?? '',
    title: preset?.title ?? '',
    style_hint: preset?.style_hint ?? '',
    theme_id: preset?.theme_id ?? 'auto',
    pages: preset?.pages?.length ? preset.pages : [emptyPage('Seite 1')],
  },
  pageIndex: 0,
});

const _addSlotToPage = (page: PagePlan, block: BlockRegistryEntry): PagePlan => {
  const slot: BlockSlot = {
    instance_id: nextInstanceId(block.id),
    block_id: block.id,
    hint: '',
  };
  return { ...page, block_slots: [...page.block_slots, slot] };
};

const _moveInArr = <T,>(arr: T[], from: number, to: number): T[] => {
  if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const out = arr.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
};

const _capBullets = (bullets: string[]): string[] =>
  bullets
    .map((b) => b.replace(/^[\s•\-*]+/, '').trim())
    .filter((b) => b.length > 0)
    .map((b) => b.slice(0, BLOCKS_MAX_BULLET_LEN))
    .slice(0, BLOCKS_MAX_PAGE_BULLETS);

export const builderReducer = (state: BuilderState, action: BuilderAction): BuilderState => {
  switch (action.type) {
    case 'set_meta': {
      return { ...state, plan: { ...state.plan, [action.field]: action.value } };
    }
    case 'add_page': {
      if (!canAddPage(state.plan)) return state;
      const pages = [...state.plan.pages, emptyPage(`Seite ${state.plan.pages.length + 1}`)];
      return { ...state, plan: { ...state.plan, pages }, pageIndex: pages.length - 1 };
    }
    case 'remove_page': {
      if (state.plan.pages.length <= 1) return state;
      const pages = state.plan.pages.filter((_, i) => i !== action.pageIndex);
      const pageIndex = Math.min(state.pageIndex, pages.length - 1);
      return { ...state, plan: { ...state.plan, pages }, pageIndex };
    }
    case 'select_page': {
      const pi = Math.max(0, Math.min(action.pageIndex, state.plan.pages.length - 1));
      return { ...state, pageIndex: pi };
    }
    case 'set_page_title': {
      const pages = state.plan.pages.map((p, i) => (i === action.pageIndex ? { ...p, title: action.title } : p));
      return { ...state, plan: { ...state.plan, pages } };
    }
    case 'set_page_bullets': {
      const bullets = _capBullets(action.bullets);
      const pages = state.plan.pages.map((p, i) => (i === action.pageIndex ? { ...p, bullets } : p));
      return { ...state, plan: { ...state.plan, pages } };
    }
    case 'add_slot': {
      const pages = state.plan.pages.map((p, i) => (i === action.pageIndex ? _addSlotToPage(p, action.block) : p));
      return { ...state, plan: { ...state.plan, pages }, pageIndex: action.pageIndex };
    }
    case 'remove_slot': {
      const pages = state.plan.pages.map((p, i) =>
        i === action.pageIndex
          ? { ...p, block_slots: p.block_slots.filter((s) => s.instance_id !== action.instanceId) }
          : p,
      );
      return { ...state, plan: { ...state.plan, pages } };
    }
    case 'move_slot': {
      const page = state.plan.pages[action.pageIndex];
      if (!page) return state;
      const idx = page.block_slots.findIndex((s) => s.instance_id === action.instanceId);
      if (idx === -1) return state;
      const block_slots = _moveInArr(page.block_slots, idx, idx + action.direction);
      const pages = state.plan.pages.map((p, i) => (i === action.pageIndex ? { ...p, block_slots } : p));
      return { ...state, plan: { ...state.plan, pages } };
    }
    case 'set_slot_hint': {
      const pages = state.plan.pages.map((p, i) => {
        if (i !== action.pageIndex) return p;
        return {
          ...p,
          block_slots: p.block_slots.map((s) =>
            s.instance_id === action.instanceId ? { ...s, hint: action.hint.slice(0, 200) } : s,
          ),
        };
      });
      return { ...state, plan: { ...state.plan, pages } };
    }
    default:
      return state;
  }
};

export const useBoardBuilderState = (preset?: Partial<CompositionPlan>) => {
  return useReducer(builderReducer, preset, initialBuilderState);
};
