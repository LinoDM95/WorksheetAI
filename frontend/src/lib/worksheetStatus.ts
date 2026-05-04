import type { BadgeTone } from '../components/ui/Badge';

/**
 * Eine einzige Quelle der Wahrheit für Worksheet-Status.
 * `<StatusBadge>` und Filter sollen sich hieran orientieren.
 */

export type WorksheetStatus = 'draft' | 'ready' | 'published' | 'shared' | string;

export type WorksheetStatusInfo = {
  tone: BadgeTone;
  label: string;
  hasCheck: boolean;
};

export const getWorksheetStatusInfo = (status?: string): WorksheetStatusInfo => {
  switch (status) {
    case 'published':
      return { tone: 'success', label: 'Geprüft', hasCheck: true };
    case 'ready':
      return { tone: 'success', label: 'Druckbereit', hasCheck: true };
    case 'shared':
      return { tone: 'primary', label: 'Geteilt', hasCheck: false };
    case 'draft':
      return { tone: 'neutral', label: 'Entwurf', hasCheck: false };
    default:
      return { tone: 'neutral', label: status || 'Entwurf', hasCheck: false };
  }
};
