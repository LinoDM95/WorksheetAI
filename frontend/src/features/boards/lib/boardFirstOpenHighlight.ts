const STORAGE_KEY = 'worksheet-ai-board-pending-first-open';

const readRawIds = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
};

export const getPendingFirstOpenBoardIds = (): string[] => readRawIds();

export const addPendingFirstOpenBoard = (id: string) => {
  const next = new Set(readRawIds());
  next.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
};

export const clearPendingFirstOpenBoard = (id: string) => {
  const raw = readRawIds();
  if (!raw.includes(id)) return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(raw.filter((x) => x !== id)),
  );
};
