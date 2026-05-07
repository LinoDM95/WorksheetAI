import type { Worksheet } from '../../types';
import type { LibraryId } from '../boards/types';

export type RecentWorksheet = Pick<Worksheet, 'id' | 'title' | 'subject' | 'grade' | 'status' | 'updated_at'>;

export type ContinueItem =
  | {
      kind: 'board';
      id: string;
      title: string;
      subject?: string;
      grade?: string;
      topic?: string;
      updated_at?: string;
      libraries?: LibraryId[];
    }
  | {
      kind: 'worksheet';
      id: string;
      title: string;
      subject?: string;
      grade?: number | null;
      status?: string;
      updated_at?: string;
    };

export type SubjectAccent = { bg: string; fg: string; pill: string };
