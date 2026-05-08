export type AuthSessionExpiredHandler = () => void;

let onSessionExpired: AuthSessionExpiredHandler | null = null;
let expiredNotified = false;

export const registerAuthSessionExpiredHandler = (handler: AuthSessionExpiredHandler | null): void => {
  onSessionExpired = handler;
};

export const resetAuthSessionExpiredFlag = (): void => {
  expiredNotified = false;
};

/**
 * Einmal pro „Session-Tod“ (Refresh scheitert dauerhaft). Idempotent, damit parallele 401s nicht mehrfach navigieren.
 */
export const notifyAuthSessionExpired = (): void => {
  if (expiredNotified) return;
  expiredNotified = true;
  try {
    onSessionExpired?.();
  } catch {
    /* Handler darf z. B. navigieren — Fehler nicht verschlucken, aber Flag bleibt gesetzt */
  }
};
