/** Wie `BoardDetail` / `BoardLibraryItem` für Schüler-Link-Entscheidungen. */
type StudentShareGate = {
  share_token?: string | null;
  student_link_enabled?: boolean;
  student_link_expires_at?: string | null;
} | null | undefined;

/** true: Dauer wählen (Prep-Modal). false: aktiver Link mit gültigem Ablaufdatum. */
export function needsStudentSharePrep(board: StudentShareGate): boolean {
  if (!board?.share_token) return true;
  if (!board.student_link_enabled) return true;
  const exp = board.student_link_expires_at;
  if (!exp) return true;
  const t = new Date(exp).getTime();
  if (Number.isNaN(t)) return true;
  return t <= Date.now();
}
