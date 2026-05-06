import type { BoardDetail } from '../types';

type StudentShareGate = Pick<BoardDetail, 'share_token' | 'student_link_enabled' | 'student_link_expires_at'> | null | undefined;

/** true: Dauer wählen (Prep-Modal). false: aktiver Link vorhanden, QR kann direkt geöffnet werden. */
export function needsStudentSharePrep(board: StudentShareGate): boolean {
  if (!board?.share_token) return true;
  if (!board.student_link_enabled) return true;
  const exp = board.student_link_expires_at;
  if (!exp) return false;
  const t = new Date(exp).getTime();
  if (Number.isNaN(t)) return true;
  return t <= Date.now();
}
