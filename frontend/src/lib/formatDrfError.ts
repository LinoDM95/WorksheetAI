import axios, { type AxiosError } from 'axios';

const joinMsgs = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => String(x)).join(' ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return '';
};

export type DrfFormErrors = {
  general: string;
  fields: Record<string, string>;
};

export const formatDrfErrorPayload = (data: unknown): DrfFormErrors => {
  const fields: Record<string, string> = {};
  const generalParts: string[] = [];

  if (!data || typeof data !== 'object') {
    return { general: 'Ein Fehler ist aufgetreten.', fields };
  }

  const d = data as Record<string, unknown>;

  if (typeof d.detail === 'string') {
    generalParts.push(d.detail);
  } else if (Array.isArray(d.detail)) {
    generalParts.push(d.detail.map(String).join(' '));
  }

  if (Array.isArray(d.non_field_errors)) {
    generalParts.push(d.non_field_errors.map(String).join(' '));
  }

  for (const [key, val] of Object.entries(d)) {
    if (key === 'detail' || key === 'non_field_errors') continue;
    const msg = joinMsgs(val).trim();
    if (msg) fields[key] = msg;
  }

  const general = generalParts.join(' ').trim();
  if (!general && Object.keys(fields).length === 0) {
    return { general: 'Ein Fehler ist aufgetreten.', fields };
  }

  return { general, fields };
};

export const formatAxiosDrfError = (e: unknown): DrfFormErrors => {
  const ax = e as AxiosError<unknown>;
  const data: unknown = ax.response?.data;
  if (data !== undefined && data !== null && typeof data === 'object') {
    return formatDrfErrorPayload(data);
  }
  if (typeof data === 'string' && data.trim()) {
    return { general: data.trim().slice(0, 500), fields: {} };
  }
  const status = ax.response?.status;
  if (status != null) {
    return {
      general: `Serverfehler (${status}). Bitte später erneut versuchen.`,
      fields: {},
    };
  }
  if (axios.isAxiosError(e) && e.message) {
    return {
      general: `Keine Verbindung zum Server (${e.message}). Bitte später erneut versuchen.`,
      fields: {},
    };
  }
  return formatDrfErrorPayload(undefined);
};
