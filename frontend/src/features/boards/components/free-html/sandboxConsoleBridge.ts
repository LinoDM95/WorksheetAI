export const WA_BOARD_SANDBOX_LOG_TYPE = 'wa-board-sandbox-log' as const;

export type WaBoardSandboxLogLevel = 'log' | 'warn' | 'error';

export type WaBoardSandboxLogPayload = {
  type: typeof WA_BOARD_SANDBOX_LOG_TYPE;
  token: string;
  level: WaBoardSandboxLogLevel;
  message: string;
  ts: number;
};

export const isWaBoardSandboxLogPayload = (data: unknown): data is WaBoardSandboxLogPayload => {
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  return (
    o.type === WA_BOARD_SANDBOX_LOG_TYPE &&
    typeof o.token === 'string' &&
    (o.level === 'log' || o.level === 'warn' || o.level === 'error') &&
    typeof o.message === 'string' &&
    typeof o.ts === 'number'
  );
};
