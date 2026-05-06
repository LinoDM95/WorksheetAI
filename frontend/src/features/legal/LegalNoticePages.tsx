import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { Card } from '../../components/ui';

const Shell = ({ title, children }: { title: string; children: React.ReactNode }) => {
  useEffect(() => {
    document.title = `${title} — WorksheetAI`;
    return () => {
      document.title = 'WorksheetAI';
    };
  }, [title]);

  return (
    <div className="min-h-[100dvh] bg-[var(--color-bg-app)] px-3 py-10 sm:px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Card className="!p-6 sm:!p-8">
          <h1 className="mb-4 text-xl font-bold text-slate-900">{title}</h1>
          <div className="space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
          <p className="mt-6">
            <Link to="/login" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              Zur Anmeldung
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
};

export const ImpressumPage = () => (
  <Shell title="Impressum">
    <p>
      Dies ist ein <strong>Platzhalter</strong>. Pflichtangaben zum Anbieter nach TMG/MStV und
      erreichbare Kontaktdaten müssen durch den Betreiber der Anwendung eingetragen werden.
    </p>
    <p>
      <strong>Verantwortlich:</strong> [Name, Anschrift]
      <br />
      <strong>E-Mail:</strong> [Kontakt]
    </p>
  </Shell>
);

export const DatenschutzPage = () => (
  <Shell title="Datenschutz">
    <p>
      Dies ist ein <strong>Platzhalter</strong>. Eine vollständige Datenschutzerklärung muss den
      tatsächlichen Vorgang in dieser App abbilden (z. B. Hosting, Logs, KI-Anbieter,
      Registrierung, Cookies, Passwort-Reset per E-Mail, Rechtsgrundlagen, Speicherdauer,
      Betroffenenrechte).
    </p>
    <p>
      Bitte diese Seite durch eine von der Verantwortlichen Stelle freigegebene Fassung ersetzen,
      bevor die Anwendung öffentlich genutzt wird.
    </p>
  </Shell>
);
