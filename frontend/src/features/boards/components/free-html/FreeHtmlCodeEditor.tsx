import { useEffect, useState } from 'react';
import { Alert, Button } from '../../../../components/ui';

type Language = 'html' | 'css' | 'javascript';

const LABELS: Record<Language, string> = {
  html: 'HTML',
  css: 'CSS',
  javascript: 'JavaScript',
};

const ROWS: Record<Language, number> = {
  html: 16,
  css: 14,
  javascript: 18,
};

type Props = {
  code: string;
  language: Language;
  busy: boolean;
  localWarnings: string[];
  onSave: (newCode: string) => void;
};

export const FreeHtmlCodeEditor = ({ code, language, busy, localWarnings, onSave }: Props) => {
  const [value, setValue] = useState(code);
  useEffect(() => {
    setValue(code);
  }, [code, language]);

  const dirty = value !== code;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{LABELS[language]}</h3>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {dirty ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">ungespeichert</span> : null}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={ROWS[language]}
        spellCheck={false}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
      {localWarnings.length > 0 && (
        <Alert tone="warn">
          <ul className="list-inside list-disc text-sm">
            {localWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setValue(code)}
          disabled={busy || !dirty}
        >
          Verwerfen
        </Button>
        <Button type="button" onClick={() => onSave(value)} loading={busy} disabled={!dirty}>
          Speichern &amp; neu laden
        </Button>
      </div>
    </div>
  );
};
