import { Alert, Button } from '../../../../components/ui';

type Props = {
  apiOk: boolean | null;
  apiErrors: string[];
  apiWarnings: string[];
  onRunValidate: () => void;
  busy: boolean;
};

export const FreeHtmlValidationPanel = ({
  apiOk,
  apiErrors,
  apiWarnings,
  onRunValidate,
  busy,
}: Props) => (
  <div className="space-y-4">
    <p className="text-sm text-slate-600">
      Server-Validierung prüft Längenlimits und blockierte Muster (z.&nbsp;B. <code>fetch</code>, <code>eval</code>,
      Worker, Storage). Die eigentliche Isolation erfolgt durch die iframe-Sandbox.
    </p>
    <Button type="button" variant="secondary" onClick={onRunValidate} loading={busy}>
      Aktuellen Stand validieren
    </Button>
    {apiOk === false && (
      <Alert tone="error">
        <ul className="list-inside list-disc text-sm">
          {apiErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </Alert>
    )}
    {apiOk === true && apiErrors.length === 0 && apiWarnings.length === 0 && (
      <Alert tone="success">Keine blockierten Muster oder Warnungen erkannt.</Alert>
    )}
    {apiWarnings.length > 0 && (
      <Alert tone="warn">
        <p className="mb-1 text-sm font-semibold">Hinweise (kein Blocker):</p>
        <ul className="list-inside list-disc text-sm">
          {apiWarnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </Alert>
    )}
  </div>
);
