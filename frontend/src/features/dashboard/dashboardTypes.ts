import type { Worksheet } from '../../types';
import type { DatasetId, LibraryId } from '../boards/types';

export type RecentWorksheet = Pick<
  Worksheet,
  'id' | 'title' | 'subject' | 'grade' | 'status' | 'updated_at' | 'page_setup' | 'thumbnail_render_model'
>;

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
      html: string;
      css: string;
      javascript: string;
      used_datasets?: DatasetId[];
    }
  | {
      kind: 'worksheet';
      id: string;
      title: string;
      subject?: string;
      grade?: number | null;
      status?: string;
      updated_at?: string;
      page_setup?: Worksheet['page_setup'];
      thumbnail_render_model?: Record<string, unknown> | null;
    };

export type SubjectAccent = { bg: string; fg: string; pill: string };
