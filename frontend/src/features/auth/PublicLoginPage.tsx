import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Heart,
  Lock,
  Printer,
  Quote,
  Server,
  Share,
  Shield,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { formatAxiosDrfError } from '../../lib/formatDrfError';
import {
  DEFAULT_AUTH_REDIRECT,
  sanitizeAuthRedirectNext,
} from '../../lib/sanitizeAuthRedirectNext';

const loginDisabled = import.meta.env.VITE_DISABLE_LOGIN === 'true';

type AuthTab = 'login' | 'register';

/* =====================================================================
   PublicLoginPage — Split-Screen Landing + Login
   Design: design/screen-landing.jsx (1:1 in TSX übersetzt)
   ===================================================================== */
export const PublicLoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, bootstrapped, refreshAuth } = useAuth();

  const [tab, setTab] = useState<AuthTab>('login');
  const [panelOpen, setPanelOpen] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  const [generalError, setGeneralError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const afterAuthTarget = useMemo(() => {
    if (searchParams.get('demo') === 'converted') {
      return '/app/abonnement';
    }
    const raw = searchParams.get('next');
    return sanitizeAuthRedirectNext(raw) ?? DEFAULT_AUTH_REDIRECT;
  }, [searchParams]);

  const sessionExpiredNotice = searchParams.get('reason') === 'session_expired';

  useEffect(() => {
    document.title = 'WorksheetAI — Gemeinsam den Unterricht von morgen bauen';
    return () => {
      document.title = 'WorksheetAI';
    };
  }, []);

  const clearErrors = () => {
    setGeneralError('');
    setFieldErrors({});
  };

  const handleTabChange = (next: AuthTab) => {
    if (next === tab) return;
    setTab(next);
    clearErrors();
  };

  if (loginDisabled) return <Navigate to="/app/dashboard" replace />;

  if (!bootstrapped) {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: '100dvh',
          background: 'var(--color-bg-app)',
          color: 'var(--color-ink-500)',
          fontSize: 14,
        }}
      >
        Laden…
      </div>
    );
  }

  if (user) return <Navigate to={afterAuthTarget} replace />;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      setGeneralError('Bitte E-Mail und Passwort eingeben.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/login/', { username: trimmed, password });
      await refreshAuth();
      navigate(afterAuthTarget, { replace: true });
    } catch (err: unknown) {
      const { general, fields } = formatAxiosDrfError(err);
      setGeneralError(general || 'Anmeldung fehlgeschlagen.');
      setFieldErrors(fields);
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    const trimmedMail = email.trim().toLowerCase();
    if (!trimmedMail || !password) {
      setGeneralError('Bitte E-Mail und Passwort angeben.');
      return;
    }
    const [firstName, ...restName] = name.trim().split(/\s+/);
    const lastName = restName.join(' ');
    setBusy(true);
    try {
      await api.post('/auth/register/', {
        email: trimmedMail,
        password,
        first_name: firstName ?? '',
        last_name: lastName,
        school: school.trim() || undefined,
      });
      await api.post('/auth/login/', { username: trimmedMail, password });
      await refreshAuth();
      navigate(afterAuthTarget, { replace: true });
    } catch (err: unknown) {
      const { general, fields } = formatAxiosDrfError(err);
      setGeneralError(general || 'Registrierung fehlgeschlagen.');
      setFieldErrors(fields);
    } finally {
      setBusy(false);
    }
  };

  const shellStyle: CSSProperties = {
    width: '100%',
    minHeight: '100dvh',
    height: '100dvh',
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: panelOpen ? '1fr 440px' : '1fr 56px',
    transition: 'grid-template-columns 380ms cubic-bezier(.4,.15,.2,1)',
    background: '#fff',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    color: 'var(--color-ink-900)',
    overflow: 'hidden',
  };

  return (
    <div className="wai-landing-shell" style={shellStyle}>
      <LandingHero />
      <LoginPanel
        open={panelOpen}
        setOpen={setPanelOpen}
        tab={tab}
        onTabChange={handleTabChange}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        name={name}
        setName={setName}
        school={school}
        setSchool={setSchool}
        keepSignedIn={keepSignedIn}
        setKeepSignedIn={setKeepSignedIn}
        busy={busy}
        generalError={generalError}
        fieldErrors={fieldErrors}
        sessionExpired={sessionExpiredNotice}
        onLoginSubmit={handleLoginSubmit}
        onRegisterSubmit={handleRegisterSubmit}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Links: Landing                                                      */
/* ------------------------------------------------------------------ */

const landingPaperBg: CSSProperties = {
  backgroundColor: '#f2efe8',
  backgroundImage:
    'radial-gradient(circle at 1px 1px, rgba(120,113,108,0.075) 1px, transparent 0), radial-gradient(ellipse 100% 55% at 50% -12%, rgba(79,70,229,0.065), transparent 50%)',
  backgroundSize: '22px 22px, 100% 100%',
};

const LandingHero = () => (
  <div
    className="relative flex h-full min-h-0 min-w-0 flex-col overflow-y-auto scroll-smooth"
    style={landingPaperBg}
  >
    <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-4 border-b border-stone-200/80 bg-[#f9f6f0]/90 px-6 py-5 backdrop-blur-md sm:px-12">
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <span className="text-[15px] font-bold tracking-tight text-stone-900">WorksheetAI</span>
      </div>
      <nav className="hidden gap-7 text-[13.5px] text-stone-600 md:flex">
        <a className="cursor-pointer transition hover:text-stone-900">Funktionen</a>
        <a className="cursor-pointer transition hover:text-stone-900">Vorlagen</a>
        <a className="cursor-pointer transition hover:text-stone-900">Für Schulen</a>
        <a className="cursor-pointer transition hover:text-stone-900">Hilfe</a>
      </nav>
      <div className="flex items-center gap-3 text-[13px]">
        <a className="cursor-pointer text-stone-600 transition hover:text-stone-900">Demo ansehen</a>
      </div>
    </header>

    <div className="mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 items-center gap-12 px-6 py-12 sm:px-12 lg:grid-cols-2 lg:gap-14 lg:py-14">
      <div className="min-w-0 max-w-xl lg:max-w-[540px]">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-indigo-800 shadow-sm shadow-stone-200/40 backdrop-blur-sm">
          <Users size={14} className="shrink-0 text-indigo-600" aria-hidden />
          Für Lehrer:innen · DSGVO-konform · Server in DE
        </div>
        <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-amber-900/70">
          Leerer Blatt-Moment? Vorbei.
        </p>
        <h1 className="text-[clamp(1.85rem,4.5vw,2.85rem)] font-bold leading-[1.08] tracking-tight text-stone-950">
          Nie wieder allein vor dem leeren Blatt
        </h1>
        <p className="mt-5 text-[1.05rem] leading-relaxed text-stone-700 sm:text-lg">
          <span className="font-semibold text-indigo-800">Kreativ entwerfen</span>
          <span className="text-stone-400"> · </span>
          <span className="font-semibold text-amber-900/85">kollegial teilen</span>
          <span className="text-stone-400"> · </span>
          <span className="font-semibold text-stone-800">
            gemeinsam den Unterricht von morgen bauen.
          </span>
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-stone-600">
          Arbeitsblätter, Smartboard-Ideen und Ideen aus der Community — ein Werkzeugkasten für
          Unterricht, den du mit Kolleg:innen wachsen lässt, statt Sonntag für Sonntag bei Null zu
          starten.
        </p>

        <ol className="mt-8 flex list-none flex-col gap-3 p-0">
          {[
            {
              n: 1,
              t: 'Kreativ entwerfen',
              d: 'A4-Arbeitsblätter und interaktive Boards — mit KI-Unterstützung und klaren Vorlagen.',
            },
            {
              n: 2,
              t: 'Kollegial teilen',
              d: 'Bibliothek und Marktplatz: Material inspiriert, du passt an — kein Erfinderzwang.',
            },
            {
              n: 3,
              t: 'Gemeinsam bauen',
              d: 'Weniger isoliertes Tüfteln, mehr Unterricht, der für morgen schon halb steht.',
            },
          ].map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-stone-200/90 bg-white text-[12px] font-bold text-indigo-700 shadow-sm">
                {s.n}
              </span>
              <div>
                <div className="text-[14px] font-semibold text-stone-900">{s.t}</div>
                <div className="text-[13px] leading-snug text-stone-600">{s.d}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-stone-200/80 pt-6">
          <div className="flex">
            {(['#c7d2fe', '#bae6fd', '#bbf7d0', '#fde68a'] as const).map((c, i) => (
              <span
                key={i}
                className="grid h-[26px] w-[26px] place-items-center rounded-full border-2 border-[#f9f6f0] text-[11px] font-bold text-stone-700 first:ml-0"
                style={{ background: c, marginLeft: i ? -8 : 0 }}
              >
                {(['AB', 'MK', 'TS', 'JL'] as const)[i]}
              </span>
            ))}
          </div>
          <p className="text-[13px] leading-snug text-stone-600">
            Schon über 120 Schulen — und tausende Ideen, die weitergegeben werden.
          </p>
        </div>
      </div>

      <div className="min-w-0 lg:justify-self-end">
        <AnimatedAppPreview />
      </div>
    </div>

    <LandingSections />

    <footer className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-stone-200/80 bg-[#ebe6dc] px-6 py-4 text-[12.5px] text-stone-600 sm:px-12">
      <span>© 2026 WorksheetAI · München</span>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link to="/impressum" className="text-inherit no-underline hover:text-stone-900">
          Impressum
        </Link>
        <Link to="/datenschutz" className="text-inherit no-underline hover:text-stone-900">
          Datenschutz
        </Link>
        <a className="cursor-pointer hover:text-stone-900">AGB</a>
        <a className="cursor-pointer hover:text-stone-900">Kontakt</a>
      </div>
    </footer>
  </div>
);

const BrandMark = () => (
  <div
    style={{
      width: 30,
      height: 30,
      borderRadius: 7,
      background: 'var(--color-primary-600)',
      display: 'grid',
      placeItems: 'center',
    }}
    aria-hidden
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 4h10l4 4v12H5z" />
      <path d="M9 10h6M9 14h6M9 18h4" />
    </svg>
  </div>
);

/* ------------------------------------------------------------------ */
/* Animated app preview                                                */
/* ------------------------------------------------------------------ */

const AnimatedAppPreview = () => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const seq = [3000, 2800, 3000, 2800, 2400];
    const id = setTimeout(() => setStep((s) => (s + 1) % 5), seq[step]);
    return () => clearTimeout(id);
  }, [step]);

  const cursorPos = [
    { x: 22, y: 26 },
    { x: 26, y: 60 },
    { x: 32, y: 86 },
    { x: 78, y: 50 },
    { x: 88, y: 16 },
  ][step];

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'relative',
          height: 480,
          borderRadius: 14,
          background: '#fff',
          border: '1px solid var(--color-border)',
          boxShadow:
            '0 30px 60px -30px rgba(15, 23, 42, 0.18), 0 8px 24px -12px rgba(15, 23, 42, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: '#f4f0e8',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 999, background: '#cbd5e1' }} />
          <span style={{ width: 9, height: 9, borderRadius: 999, background: '#cbd5e1' }} />
          <span style={{ width: 9, height: 9, borderRadius: 999, background: '#cbd5e1' }} />
          <div
            style={{
              marginLeft: 10,
              fontSize: 11,
              padding: '3px 10px',
              borderRadius: 5,
              background: '#fff',
              border: '1px solid var(--color-border)',
              color: 'var(--color-ink-500)',
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}
          >
            app.worksheetai.de
          </div>
          <div style={{ flex: 1 }} />
          <StepLabel step={step} />
        </div>

        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            position: 'relative',
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: 18,
              borderRight: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minWidth: 0,
              background: '#fafbfd',
            }}
          >
            <SectionLabel n={1} active={step === 0} done={step > 0}>
              Inhalt
            </SectionLabel>
            <PromptBox
              active={step === 0}
              text={'Mathematik · Klasse 9\nLineare Gleichungen, 8 Aufgaben\nmit Lösungen.'}
            />

            <SectionLabel n={2} active={step === 1} done={step > 1}>
              Vorlage
            </SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {(['Akademisch', 'Modern', 'Klassisch', 'Verspielt'] as const).map((t, i) => {
                const picked = step >= 1 && i === 0;
                const hovered = step === 1 && i === 0;
                return (
                  <div
                    key={t}
                    style={{
                      padding: '9px 8px',
                      borderRadius: 7,
                      fontSize: 11.5,
                      fontWeight: 600,
                      textAlign: 'center',
                      background: picked ? 'var(--color-primary-50)' : '#fff',
                      border: `1px solid ${
                        picked ? 'var(--color-primary-300)' : 'var(--color-border)'
                      }`,
                      color: picked ? 'var(--color-primary-700)' : 'var(--color-ink-700)',
                      transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
                      boxShadow: hovered
                        ? '0 4px 10px -4px rgba(79,70,229,0.25)'
                        : 'none',
                      transition: 'all 240ms ease',
                    }}
                  >
                    {t}
                  </div>
                );
              })}
            </div>

            <div style={{ flex: 1 }} />

            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: 'none',
                background:
                  step >= 2 ? 'var(--color-primary-600)' : 'var(--color-primary-400)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow:
                  step === 2 ? '0 0 0 4px rgba(99,102,241,0.18)' : 'none',
                transition: 'all 240ms ease',
                cursor: 'default',
              }}
            >
              {step >= 2 ? (
                <>
                  <Spinner spin={step === 2} done={step > 2} />{' '}
                  {step === 2 ? 'Generiere…' : 'Generiert'}
                </>
              ) : (
                <>Mit KI erstellen</>
              )}
            </button>
          </div>

          <div
            style={{
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              background: '#fff',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <SectionLabel n={3} active={step >= 3} done={step > 3}>
                Vorschau
              </SectionLabel>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                style={{
                  padding: '4px 10px',
                  borderRadius: 5,
                  fontSize: 10.5,
                  fontWeight: 600,
                  background: step === 4 ? 'var(--color-ink-900)' : '#fff',
                  color: step === 4 ? '#fff' : 'var(--color-ink-700)',
                  border: `1px solid ${
                    step === 4 ? 'var(--color-ink-900)' : 'var(--color-border)'
                  }`,
                  boxShadow: step === 4 ? '0 0 0 4px rgba(15,23,42,0.1)' : 'none',
                  transition: 'all 240ms ease',
                  cursor: 'default',
                }}
              >
                PDF speichern
              </button>
            </div>
            <MiniPaper step={step} />
          </div>

          <Cursor
            x={cursorPos.x}
            y={cursorPos.y}
            click={step === 1 || step === 2 || step === 4}
          />
        </div>
      </div>

      <FloatingNote text="≈ 90 Sekunden statt 90 Minuten" />
    </div>
  );
};

const SectionLabel = ({
  n,
  active,
  done,
  children,
}: {
  n: number;
  active: boolean;
  done: boolean;
  children: ReactNode;
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 10.5,
      fontWeight: 700,
      color: active
        ? 'var(--color-primary-700)'
        : done
          ? 'var(--color-ink-500)'
          : 'var(--color-ink-400)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    }}
  >
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        fontSize: 9.5,
        display: 'grid',
        placeItems: 'center',
        background: active
          ? 'var(--color-primary-50)'
          : done
            ? '#dcfce7'
            : 'var(--color-ink-100)',
        color: active
          ? 'var(--color-primary-700)'
          : done
            ? '#166534'
            : 'var(--color-ink-500)',
        border: `1px solid ${
          active ? 'var(--color-primary-100)' : done ? '#86efac' : 'transparent'
        }`,
      }}
    >
      {done ? '✓' : n}
    </span>
    {children}
  </div>
);

const StepLabel = ({ step }: { step: number }) => {
  const labels = [
    'Inhalt eingeben',
    'Vorlage wählen',
    'KI generiert',
    'Vorschau prüfen',
    'Als PDF speichern',
  ];
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 9px',
        borderRadius: 5,
        background: 'var(--color-primary-50)',
        color: 'var(--color-primary-700)',
        border: '1px solid var(--color-primary-100)',
      }}
    >
      {labels[step]}
    </div>
  );
};

const PromptBox = ({ active, text }: { active: boolean; text: string }) => {
  const [shown, setShown] = useState('');
  useEffect(() => {
    let i = 0;
    setShown('');
    const id = setInterval(() => {
      i += 2;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 32);
    return () => clearInterval(id);
  }, [text]);

  return (
    <div
      style={{
        padding: 10,
        borderRadius: 8,
        minHeight: 78,
        background: '#fff',
        border: `1px solid ${active ? 'var(--color-primary-300)' : 'var(--color-border)'}`,
        boxShadow: active ? '0 0 0 4px rgba(99,102,241,0.12)' : 'none',
        transition: 'all 240ms ease',
        fontSize: 12.5,
        color: 'var(--color-ink-900)',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.5,
      }}
    >
      {shown}
      <span
        style={{
          display: 'inline-block',
          width: 5,
          height: 12,
          marginLeft: 1,
          background: 'var(--color-primary-600)',
          verticalAlign: 'middle',
          animation: 'wai-blink 1s steps(2) infinite',
        }}
      />
    </div>
  );
};

const Spinner = ({ spin, done }: { spin: boolean; done: boolean }) =>
  done ? (
    <span style={{ display: 'inline-block', width: 13, height: 13 }}>✓</span>
  ) : (
    <span
      style={{
        display: 'inline-block',
        width: 13,
        height: 13,
        borderRadius: 999,
        border: '2px solid rgba(255,255,255,0.4)',
        borderTopColor: '#fff',
        animation: spin ? 'wai-spin 0.9s linear infinite' : 'none',
      }}
    />
  );

type PaperLine =
  | { type: 'h'; w: number }
  | { type: 's'; w: number }
  | { type: 'gap' }
  | { type: 'q'; n: number; w: number };

const MiniPaper = ({ step }: { step: number }) => {
  const visible = step >= 2;
  const lines: PaperLine[] = [
    { type: 'h', w: 60 },
    { type: 's', w: 35 },
    { type: 'gap' },
    { type: 'q', n: 1, w: 75 },
    { type: 'q', n: 2, w: 80 },
    { type: 'q', n: 3, w: 70 },
    { type: 'gap' },
    { type: 'q', n: 4, w: 65 },
    { type: 'q', n: 5, w: 78 },
  ];
  return (
    <div
      style={{
        flex: 1,
        borderRadius: 4,
        background: '#fff',
        padding: '14px 16px',
        border: '1px solid var(--color-border-strong)',
        boxShadow: '0 12px 28px -12px rgba(15,23,42,0.18)',
        transition: 'all 600ms cubic-bezier(.4,.15,.2,1)',
        position: 'relative',
        overflow: 'hidden',
        opacity: visible ? 1 : 0.5,
      }}
    >
      {!visible && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--color-ink-400)',
            fontSize: 11.5,
            fontWeight: 500,
          }}
        >
          Wartet auf Eingabe…
        </div>
      )}
      {visible &&
        lines.map((l, i) => {
          if (l.type === 'gap') return <div key={i} style={{ height: 6 }} />;
          if (l.type === 'h')
            return (
              <div
                key={i}
                className="wai-line-in"
                style={
                  {
                    ['--d']: `${i * 80}ms`,
                    height: 7,
                    background: 'var(--color-ink-900)',
                    borderRadius: 2,
                    width: `${l.w}%`,
                    marginBottom: 4,
                  } as CSSProperties
                }
              />
            );
          if (l.type === 's')
            return (
              <div
                key={i}
                className="wai-line-in"
                style={
                  {
                    ['--d']: `${i * 80}ms`,
                    height: 4,
                    background: 'var(--color-ink-300)',
                    borderRadius: 2,
                    width: `${l.w}%`,
                    marginBottom: 8,
                  } as CSSProperties
                }
              />
            );
          return (
            <div
              key={i}
              className="wai-line-in"
              style={
                {
                  ['--d']: `${i * 80}ms`,
                  display: 'flex',
                  gap: 6,
                  marginBottom: 6,
                } as CSSProperties
              }
            >
              <span
                style={{
                  fontSize: 8.5,
                  fontWeight: 700,
                  color: 'var(--color-primary-700)',
                  background: 'var(--color-primary-50)',
                  padding: '1px 4px',
                  borderRadius: 3,
                }}
              >
                {l.n}
              </span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    height: 3.5,
                    background: 'var(--color-ink-300)',
                    borderRadius: 2,
                    width: `${l.w}%`,
                    marginBottom: 3,
                  }}
                />
                <div
                  style={{
                    height: 3.5,
                    background: 'var(--color-ink-200)',
                    borderRadius: 2,
                    width: `${l.w - 15}%`,
                  }}
                />
              </div>
            </div>
          );
        })}

      {step >= 3 && (
        <div
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            padding: '3px 8px',
            borderRadius: 4,
            background: '#dcfce7',
            color: '#166534',
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            border: '1px solid #86efac',
            animation: 'wai-pop 400ms cubic-bezier(.4,1.4,.6,1)',
          }}
        >
          Druckbereit · 2 S.
        </div>
      )}
    </div>
  );
};

const Cursor = ({ x, y, click }: { x: number; y: number; click: boolean }) => (
  <div
    style={{
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-2px, -2px)',
      transition:
        'left 700ms cubic-bezier(.4,.15,.2,1), top 700ms cubic-bezier(.4,.15,.2,1)',
      pointerEvents: 'none',
      zIndex: 10,
    }}
  >
    <svg
      width="18"
      height="20"
      viewBox="0 0 20 22"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(15,23,42,0.25))' }}
    >
      <path
        d="M2 2 L2 16 L6 13 L9 19 L11 18 L8.5 12 L14 12 Z"
        fill="#fff"
        stroke="#0f172a"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
    {click && (
      <span
        style={{
          position: 'absolute',
          left: -5,
          top: -5,
          width: 24,
          height: 24,
          borderRadius: 999,
          border: '2px solid var(--color-primary-400)',
          animation: 'wai-click 0.6s ease-out',
        }}
      />
    )}
  </div>
);

const FloatingNote = ({ text }: { text: string }) => (
  <div
    style={{
      position: 'absolute',
      left: -20,
      top: '50%',
      transform: 'translateY(-50%)',
      background: '#fff',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--color-ink-700)',
      boxShadow: '0 8px 18px -8px rgba(15,23,42,0.18)',
      whiteSpace: 'nowrap',
      zIndex: 5,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}
  >
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: 'var(--color-success-600)',
      }}
    />
    {text}
  </div>
);

/* ====================================================================== */
/* Landing-Sektionen: warmer „Papier“-Look, Claim Kreativ · kollegial · gemeinsam */
/* ====================================================================== */

const LandingSections = () => (
  <>
    <PainAvoidanceSection />
    <CognitiveEaseSection />
    <SocialProofSection />
    <CommunitySection />
    <ClosingCtaSection />
  </>
);

/* -- 1. Pain Avoidance: Vorher / Nachher --------------------------------- */
const PainAvoidanceSection = () => (
  <section className="relative overflow-hidden bg-[#faf8f4]">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-300/70 to-transparent" />
    <div className="mx-auto w-full max-w-[1280px] px-6 py-24 sm:px-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/90 bg-amber-50/90 px-3 py-1 text-[12px] font-semibold text-amber-900">
          <Clock size={13} aria-hidden /> Leeres Blatt, voller Kopf
        </span>
        <h2 className="mt-5 text-[34px] font-bold leading-[1.15] tracking-tight text-stone-900">
          Allein tüfteln — oder mit Struktur und Kolleg:innen starten?
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-stone-600">
          Wenn vor dir nur ein weißes Dokument blinkt, fühlt sich vorbereiten wie Inselurlaub auf
          dem Arbeitstisch an. Der Weg raus: klare Schritte, gute Vorlagen — und Ideen, die andere
          schon mit dir teilen.
        </p>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        {/* VORHER */}
        <div className="relative rounded-3xl border border-rose-100/80 bg-gradient-to-br from-rose-50/80 via-white to-amber-50/60 p-8 shadow-[0_18px_40px_-22px_rgba(244,63,94,0.18)]">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-rose-700 ring-1 ring-rose-100 backdrop-blur">
              Vorher
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-rose-700/80">
              <Clock size={13} aria-hidden /> Sonntag · 22:47
            </span>
          </div>

          <BeforeMockup />

          <ul className="mt-6 space-y-3">
            {[
              'Word friert ein. Der Tabulator springt. Wieder.',
              'Aufgaben aus dem Schulbuch abtippen — oder PDFs zusammenkopieren.',
              'Jedes Mal aufs Neue: Layout, Schriftgröße, Linealabstände.',
              'Lösungsblatt? Müsstest du noch selbst durchrechnen.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[14.5px] leading-snug text-slate-700">
                <XCircle size={18} className="mt-0.5 flex-shrink-0 text-rose-500" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* NACHHER */}
        <div className="relative rounded-3xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/60 p-8 shadow-[0_18px_40px_-22px_rgba(79,70,229,0.22)]">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-700 ring-1 ring-indigo-100 backdrop-blur">
              Nachher
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-indigo-700/80">
              <Clock size={13} aria-hidden /> Donnerstag · 15:12
            </span>
          </div>

          <AfterMockup />

          <ul className="mt-6 space-y-3">
            {[
              'Zwei Sätze: „Mathematik · Klasse 9 · 8 lineare Gleichungen mit Lösungen.“',
              'LaTeX-Brüche, Tabellen, Lineale — fertig. Mehr Raum für kreative Feinarbeit.',
              'Lösungsblatt liegt automatisch bei. Zwei Seiten, druckbereit.',
              'Oder: Von Kolleg:innen inspirieren lassen statt bei null anzufangen.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[14.5px] leading-snug text-slate-700">
                <CheckCircle2
                  size={18}
                  className="mt-0.5 flex-shrink-0 text-indigo-600"
                  aria-hidden
                />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </section>
);

const BeforeMockup = () => (
  <div className="relative mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_24px_-14px_rgba(15,23,42,0.18)]">
    <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <span className="h-2 w-2 rounded-full bg-rose-300" />
      <span className="h-2 w-2 rounded-full bg-amber-300" />
      <span className="h-2 w-2 rounded-full bg-emerald-300" />
      <span className="ml-2 truncate font-mono text-[10.5px] text-slate-500">
        Arbeitsblatt-Mathe-9b_v17_FINAL_final2.docx
      </span>
    </div>
    <div className="space-y-2 p-5">
      <div className="flex items-center gap-2">
        <div className="h-3 w-1/3 rounded bg-slate-300" />
        <span className="rounded-sm bg-rose-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-rose-700">
          Schriftart fehlt
        </span>
      </div>
      <div className="h-2 w-2/3 rounded bg-slate-200" />
      <div className="h-2 w-1/2 rounded bg-slate-200" />
      <div className="ml-8 space-y-1.5 pt-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-3 rounded-sm bg-rose-200" />
          <div className="h-2 w-3/5 rounded bg-slate-200" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-3 rounded-sm bg-rose-200" />
          <div className="h-2 w-1/2 rounded bg-slate-200" />
        </div>
        <div className="ml-12 flex items-center gap-2 rounded border border-rose-200 bg-rose-50 px-2 py-1">
          <span className="font-mono text-[10px] text-rose-700">Tab → springt</span>
        </div>
      </div>
      <div className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
        <span className="h-1.5 w-1.5 rounded-full bg-white" />
        nicht gespeichert
      </div>
    </div>
  </div>
);

const AfterMockup = () => (
  <div className="relative mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_24px_-14px_rgba(15,23,42,0.14)]">
    <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <span className="h-2 w-2 rounded-full bg-slate-300" />
      <span className="h-2 w-2 rounded-full bg-slate-300" />
      <span className="h-2 w-2 rounded-full bg-slate-300" />
      <span className="ml-2 truncate font-mono text-[10.5px] text-slate-500">
        lineare-gleichungen-9b.pdf · druckbereit
      </span>
    </div>
    <div className="space-y-3 p-5">
      <div className="flex items-baseline gap-2">
        <div className="h-3 w-1/2 rounded bg-slate-900" />
        <div className="h-2 w-16 rounded bg-slate-300" />
      </div>
      <div className="h-2 w-1/3 rounded bg-slate-200" />
      <div className="space-y-1.5 pt-1">
        {[68, 74, 60, 70].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="grid h-3.5 w-3.5 place-items-center rounded-sm bg-indigo-50 text-[8.5px] font-bold text-indigo-700 ring-1 ring-indigo-100">
              {i + 1}
            </span>
            <div className="h-2 rounded bg-slate-200" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
      <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 size={11} aria-hidden /> Druckbereit · 2 S.
      </div>
    </div>
  </div>
);

/* -- 2. Cognitive Ease: 3 Schritte --------------------------------------- */
const CognitiveEaseSection = () => (
  <section className="relative border-y border-stone-200/80 bg-gradient-to-b from-[#f5f0e8]/90 to-white">
    <div className="mx-auto w-full max-w-[1280px] px-6 py-24 sm:px-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700">
          <Sparkles size={13} aria-hidden /> Kreativ · kollegial · einsatzbereit
        </span>
        <h2 className="mt-5 text-[34px] font-bold leading-[1.15] tracking-tight text-stone-900">
          Drei klare Schritte zum Unterricht von morgen
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-stone-600">
          Entwerfen, anpassen, teilen — ohne Word-Chaos und ohne dich durch endlose Tutorials zu
          klicken.
        </p>
      </div>

      <ol className="relative mt-16 grid gap-6 md:grid-cols-3 md:gap-5">
        {/* dezenter Verbindungs-Strich auf md+ zwischen den drei Schritten */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-[16.66%] right-[16.66%] top-12 hidden h-px bg-gradient-to-r from-indigo-100 via-indigo-200 to-indigo-100 md:block"
        />
        <StepCard
          n={1}
          icon={<Sparkles size={26} strokeWidth={1.7} aria-hidden />}
          title="Kreativ entwerfen"
          body="Community-Vorlage wählen oder mit wenigen Sätzen neu erzeugen — Arbeitsblatt oder Board."
        />
        <StepCard
          n={2}
          icon={<Share size={26} strokeWidth={1.7} aria-hidden />}
          title="Kollegial nutzen & anpassen"
          body="Material von Kolleg:innen als Startpunkt. Du passt Klasse, Umfang und Ton in Minuten an."
        />
        <StepCard
          n={3}
          icon={<Printer size={26} strokeWidth={1.7} aria-hidden />}
          title="Fürs Klassenzimmer bereit machen"
          body="Druck-PDF, Lösungsblatt dazu — oder interaktives Tafelbild fürs Smartboard."
        />
      </ol>
    </div>
  </section>
);

const StepCard = ({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: ReactNode;
  title: string;
  body: string;
}) => (
  <li className="group relative rounded-3xl border border-slate-200/80 bg-white/80 p-7 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.06)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(79,70,229,0.22)]">
    <div className="flex items-center gap-4">
      <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
        {icon}
      </span>
      <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-indigo-700/70">
        Schritt {String(n).padStart(2, '0')}
      </span>
    </div>
    <h3 className="mt-5 text-[19px] font-semibold leading-tight tracking-tight text-slate-900">
      {title}
    </h3>
    <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">{body}</p>
  </li>
);

/* -- 3. Social Proof + Trust -------------------------------------------- */
const SocialProofSection = () => (
  <section className="relative overflow-hidden bg-[#f0ebe3]">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_1px_1px,rgba(120,113,108,0.06)_1px,transparent_0)] [background-size:22px_22px]"
    />
    <div className="relative mx-auto w-full max-w-[1280px] px-6 py-24 sm:px-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-800">
          <Users size={13} aria-hidden /> Gemeinschaft aus über 12.000 Lehrkräften
        </span>
        <h2 className="mt-5 text-[34px] font-bold leading-[1.15] tracking-tight text-stone-900">
          Kolleg:innen, die nicht mehr allein vorm Blatt sitzen
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-stone-600">
          Echte Stimmen — weniger Einzelkämpfer:innen, mehr Unterricht, der zusammen wächst.
        </p>
      </div>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        <Testimonial
          quote="Ich starte nicht mehr mit leerem Dokument — zwei Sätze, und ich habe etwas, das ich anpassen und mit meiner Fachschaft teilen kann."
          author="Anna B."
          role="Mathematik & Physik"
          school="Goethe-Gymnasium München"
          avatarBg="#c7d2fe"
          initials="AB"
        />
        <Testimonial
          quote="Skeptisch war ich. Bis das Differenzierungs-Set in vier Minuten da war — und tatsächlich für meine 7c passte."
          author="Markus K."
          role="Deutsch & Geschichte"
          school="IGS Bremen-Vegesack"
          avatarBg="#bae6fd"
          initials="MK"
        />
        <Testimonial
          quote="Smartboard-Tafelbilder, die wirklich funktionieren — ohne 40 Minuten Vorbereitung. Endlich."
          author="Tobias S."
          role="Sachunterricht 4. Klasse"
          school="GS Köln-Lindenthal"
          avatarBg="#bbf7d0"
          initials="TS"
        />
      </div>

      <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TrustBadge
          icon={<Shield size={20} strokeWidth={1.7} aria-hidden />}
          title="100 % DSGVO-konform"
          body="Geprüft nach Art. 32 DSGVO. AV-Vertrag inklusive."
        />
        <TrustBadge
          icon={<Server size={20} strokeWidth={1.7} aria-hidden />}
          title="Server in Deutschland"
          body="Hosting in Frankfurt am Main. Keine Daten-Reise in die USA."
          flag
        />
        <TrustBadge
          icon={<Lock size={20} strokeWidth={1.7} aria-hidden />}
          title="Keine Schülerdaten"
          body="Wir verarbeiten keine Schülerinformationen. Nie."
        />
        <TrustBadge
          icon={<Heart size={20} strokeWidth={1.7} aria-hidden />}
          title="Von Lehrkräften — für Lehrkräfte"
          body="Mitgegründet von zwei Lehrer:innen aus NRW & Bayern."
        />
      </div>
    </div>
  </section>
);

const Testimonial = ({
  quote,
  author,
  role,
  school,
  avatarBg,
  initials,
}: {
  quote: string;
  author: string;
  role: string;
  school: string;
  avatarBg: string;
  initials: string;
}) => (
  <figure className="relative flex h-full flex-col rounded-3xl border border-white/60 bg-white/80 p-7 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)] backdrop-blur-sm">
    <Quote
      size={22}
      className="absolute right-6 top-6 text-indigo-200"
      strokeWidth={1.6}
      aria-hidden
    />
    <blockquote className="text-[15.5px] font-medium leading-relaxed text-slate-800">
      „{quote}"
    </blockquote>
    <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
      <span
        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-[13px] font-bold text-slate-700 ring-2 ring-white"
        style={{ background: avatarBg }}
        aria-hidden
      >
        {initials}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-semibold text-slate-900">{author}</div>
        <div className="truncate text-[12px] text-slate-500">
          {role} · {school}
        </div>
      </div>
    </figcaption>
  </figure>
);

const TrustBadge = ({
  icon,
  title,
  body,
  flag,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  flag?: boolean;
}) => (
  <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.06)]">
    <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
      {icon}
    </span>
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[13.5px] font-semibold text-slate-900">{title}</span>
        {flag && (
          <span
            aria-hidden
            className="inline-flex h-3 overflow-hidden rounded-sm ring-1 ring-slate-200"
            title="Hosted in Germany"
          >
            <span className="block h-1 w-3 bg-slate-900" />
            <span className="block h-1 w-3 bg-rose-600" />
            <span className="block h-1 w-3 bg-amber-400" />
          </span>
        )}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">{body}</p>
    </div>
  </div>
);

/* -- 4. Reciprocity: Community / Marktplatz ----------------------------- */
const CommunitySection = () => (
  <section className="relative overflow-hidden bg-[#fffcf7]">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/80 to-transparent"
    />
    <div className="mx-auto w-full max-w-[1280px] px-6 py-24 sm:px-12">
      <div className="grid items-start gap-14 lg:grid-cols-[5fr_7fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700">
            <Share size={13} aria-hidden /> Kollegial teilen · Marktplatz · kostenlos
          </span>
          <h2 className="mt-5 text-[34px] font-bold leading-[1.1] tracking-tight text-stone-900">
            Gemeinsam Materialien wachsen lassen
            <br />
            <span className="text-indigo-600">statt jedes Mal bei null.</span>
          </h2>
          <p className="mt-5 text-[15.5px] leading-relaxed text-stone-600">
            Du erstellst ein Differenzierungs-Set für deine 7c. Eine Kollegin in Hamburg lädt es
            runter, passt es für ihre 7b an. Ein Kollege in Stuttgart legt seine Lösungs-Variante
            dazu.
          </p>
          <p className="mt-3 text-[15.5px] leading-relaxed text-stone-600">
            So baut ihr den Unterricht von morgen gemeinsam — der Marktplatz ist{' '}
            <span className="font-semibold text-stone-900">kostenlos</span> und bleibt es.
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-4 border-y border-slate-200 py-6">
            <Stat value="12.847" label="geteilte Materialien" />
            <Stat value="3.200" label="aktive Kolleg:innen" />
            <Stat value="100 %" label="kostenlos" />
          </dl>

          <a
            href="#login"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-slate-800"
          >
            Marktplatz erkunden
            <ArrowRight size={16} aria-hidden />
          </a>
        </div>

        <CommunityShowcase />
      </div>
    </div>
  </section>
);

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div>
    <dt className="text-[28px] font-bold leading-none tracking-tight text-slate-900">
      {value}
    </dt>
    <dd className="mt-1.5 text-[12.5px] leading-snug text-slate-500">{label}</dd>
  </div>
);

const CommunityShowcase = () => {
  const items: Array<{
    title: string;
    subject: string;
    grade: string;
    author: string;
    avatarBg: string;
    initials: string;
    downloads: string;
    accent: string;
  }> = [
    {
      title: 'Bruchrechnen — Diagnose-Set',
      subject: 'Mathematik',
      grade: '5./6. Klasse',
      author: 'Anna B.',
      avatarBg: '#c7d2fe',
      initials: 'AB',
      downloads: '1.247× geladen',
      accent: 'from-indigo-100/70 to-white',
    },
    {
      title: 'Lesetagebuch „Tschick"',
      subject: 'Deutsch',
      grade: '9. Klasse',
      author: 'Markus K.',
      avatarBg: '#bae6fd',
      initials: 'MK',
      downloads: '892× geladen',
      accent: 'from-sky-100/70 to-white',
    },
    {
      title: 'Das Auge — Aufbau & Funktion',
      subject: 'Sachunterricht',
      grade: '4. Klasse',
      author: 'Saskia H.',
      avatarBg: '#bbf7d0',
      initials: 'SH',
      downloads: '2.041× geladen',
      accent: 'from-emerald-100/70 to-white',
    },
    {
      title: 'Vocabulary Quiz · Unit 3',
      subject: 'Englisch',
      grade: '7. Klasse',
      author: 'Tobias S.',
      avatarBg: '#fde68a',
      initials: 'TS',
      downloads: '633× geladen',
      accent: 'from-amber-100/70 to-white',
    },
  ];
  return (
    <div className="relative">
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((it) => (
          <article
            key={it.title}
            className={`group rounded-2xl border border-slate-200/80 bg-gradient-to-br ${it.accent} p-5 shadow-[0_4px_14px_-6px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-14px_rgba(79,70,229,0.22)]`}
          >
            <MaterialThumbnail />
            <div className="mt-4 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-indigo-700/80">
              <span>{it.subject}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">{it.grade}</span>
            </div>
            <h3 className="mt-1.5 text-[14.5px] font-semibold leading-snug text-slate-900">
              {it.title}
            </h3>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200/70 pt-3 text-[11.5px] text-slate-500">
              <span className="inline-flex items-center gap-2">
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-slate-700 ring-2 ring-white"
                  style={{ background: it.avatarBg }}
                  aria-hidden
                >
                  {it.initials}
                </span>
                <span className="truncate">geteilt von {it.author}</span>
              </span>
              <span className="font-medium text-slate-600">{it.downloads}</span>
            </div>
          </article>
        ))}
      </div>

      {/* Schwebender Bonus-Hinweis */}
      <div
        className="absolute -left-4 -top-6 hidden rounded-xl border border-indigo-100 bg-white/95 px-3 py-2 text-[11.5px] font-semibold text-indigo-700 shadow-[0_10px_24px_-12px_rgba(79,70,229,0.35)] backdrop-blur md:block"
      >
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
        +28 neue Materialien diese Woche
      </div>
    </div>
  );
};

const MaterialThumbnail = () => (
  <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_4px_10px_-6px_rgba(15,23,42,0.1)]">
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-1/2 rounded bg-slate-900" />
        <div className="h-1.5 w-8 rounded bg-slate-200" />
      </div>
      <div className="h-1.5 w-1/3 rounded bg-slate-200" />
      <div className="space-y-1 pt-1.5">
        {[70, 78, 64].map((w, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="grid h-2.5 w-2.5 place-items-center rounded-sm bg-indigo-50 text-[7px] font-bold text-indigo-700 ring-1 ring-indigo-100">
              {i + 1}
            </span>
            <div className="h-1.5 rounded bg-slate-200" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* -- Closing CTA -------------------------------------------------------- */
const ClosingCtaSection = () => (
  <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-600 to-indigo-700 text-white">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.18),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(165,180,252,0.25),transparent_55%)]"
    />
    <div className="relative mx-auto w-full max-w-[1080px] px-6 py-20 text-center sm:px-12">
      <h2 className="text-[32px] font-bold leading-[1.15] tracking-tight">
        Bereit, kreativ zu entwerfen und kollegial zu teilen?
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-indigo-100">
        14 Tage kostenlos testen. Keine Kreditkarte. Gemeinsam den Unterricht von morgen bauen —
        statt allein vorm leeren Blatt.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <a
          href="#login"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[14.5px] font-semibold text-indigo-700 shadow-[0_8px_20px_-6px_rgba(15,23,42,0.35)] transition hover:bg-indigo-50"
        >
          Jetzt kostenlos starten
          <ArrowRight size={16} aria-hidden />
        </a>
        <a className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/30 px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10">
          Demo ansehen
        </a>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] text-indigo-200">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 size={14} aria-hidden /> DSGVO-konform
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 size={14} aria-hidden /> Server in Deutschland
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 size={14} aria-hidden /> Jederzeit kündbar
        </span>
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------ */
/* Rechts: einklappbares Login-Panel                                   */
/* ------------------------------------------------------------------ */

type LoginPanelProps = {
  open: boolean;
  setOpen: (v: boolean) => void;
  tab: AuthTab;
  onTabChange: (t: AuthTab) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  school: string;
  setSchool: (v: string) => void;
  keepSignedIn: boolean;
  setKeepSignedIn: (v: boolean) => void;
  busy: boolean;
  generalError: string;
  fieldErrors: Record<string, string>;
  sessionExpired: boolean;
  onLoginSubmit: (e: React.FormEvent) => void;
  onRegisterSubmit: (e: React.FormEvent) => void;
};

const LoginPanel = (props: LoginPanelProps) => {
  const {
    open,
    setOpen,
    tab,
    onTabChange,
    email,
    setEmail,
    password,
    setPassword,
    name,
    setName,
    school,
    setSchool,
    keepSignedIn,
    setKeepSignedIn,
    busy,
    generalError,
    fieldErrors,
    sessionExpired,
    onLoginSubmit,
    onRegisterSubmit,
  } = props;

  return (
    <aside
      id="login"
      className="wai-login-panel"
      style={{
        position: 'relative',
        background: '#fff',
        borderLeft: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Login ein-/ausklappen"
        aria-expanded={open}
        className="wai-login-toggle"
        style={{
          position: 'absolute',
          left: -14,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 28,
          height: 56,
          borderRadius: '8px 0 0 8px',
          background: '#fff',
          border: '1px solid var(--color-border)',
          borderRight: 'none',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: '-6px 0 12px -6px rgba(15,23,42,0.1)',
          zIndex: 12,
          padding: 0,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-ink-700)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: 'transform 320ms',
            transform: open ? 'rotate(0)' : 'rotate(180deg)',
          }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {!open && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '22px 0',
            gap: 22,
          }}
        >
          <BrandMark />
          <div
            style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-ink-700)',
            }}
          >
            Anmelden / Registrieren
          </div>
        </div>
      )}

      {open && (
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <div style={{ padding: '28px 36px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BrandMark />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--color-ink-900)',
                }}
              >
                WorksheetAI
              </span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px' }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--color-ink-900)',
                letterSpacing: '-0.015em',
                margin: '8px 0 6px',
              }}
            >
              {tab === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </h2>
            <p
              style={{
                fontSize: 13.5,
                color: 'var(--color-ink-500)',
                margin: '0 0 22px',
                lineHeight: 1.5,
              }}
            >
              {tab === 'login'
                ? 'Mit deinem WorksheetAI-Konto fortfahren.'
                : '14 Tage kostenlos testen — keine Kreditkarte nötig.'}
            </p>

            {sessionExpired && (
              <InlineNotice tone="warn">
                Deine Sitzung ist abgelaufen. Bitte melde dich erneut an — laufende Aufträge wurden
                beendet.
              </InlineNotice>
            )}

            <div
              role="tablist"
              aria-label="Anmelden oder Registrieren"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
                padding: 3,
                borderRadius: 7,
                background: 'var(--color-ink-100)',
                marginBottom: 22,
              }}
            >
              {(
                [
                  { id: 'login' as const, l: 'Anmelden' },
                  { id: 'register' as const, l: 'Registrieren' },
                ]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => onTabChange(t.id)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 5,
                    border: 'none',
                    cursor: 'pointer',
                    background: tab === t.id ? '#fff' : 'transparent',
                    color: tab === t.id ? 'var(--color-ink-900)' : 'var(--color-ink-500)',
                    fontSize: 13,
                    fontWeight: 600,
                    boxShadow: tab === t.id ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
                    transition: 'all 160ms',
                  }}
                >
                  {t.l}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginBottom: 18,
              }}
            >
              <SsoButton kind="google" />
              <SsoButton kind="microsoft" />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                gap: 10,
                marginBottom: 18,
                fontSize: 11,
                color: 'var(--color-ink-400)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontWeight: 600,
              }}
            >
              <span style={{ height: 1, background: 'var(--color-border)' }} />
              oder
              <span style={{ height: 1, background: 'var(--color-border)' }} />
            </div>

            <form
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              onSubmit={tab === 'login' ? onLoginSubmit : onRegisterSubmit}
              noValidate
            >
              {tab === 'register' && (
                <FormField
                  label="Name"
                  placeholder="Anna Becker"
                  autoComplete="name"
                  value={name}
                  onChange={setName}
                  error={fieldErrors.first_name ?? fieldErrors.last_name ?? fieldErrors.name}
                />
              )}
              <FormField
                label="E-Mail"
                placeholder="anna.becker@schule.de"
                type="email"
                autoComplete="email"
                value={email}
                onChange={setEmail}
                error={fieldErrors.email ?? fieldErrors.username}
              />
              <FormField
                label="Passwort"
                placeholder="••••••••"
                type="password"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={setPassword}
                error={fieldErrors.password}
                hint={
                  tab === 'login' ? (
                    <Link
                      to="/passwort-vergessen"
                      style={{
                        color: 'var(--color-primary-700)',
                        fontWeight: 600,
                        fontSize: 12.5,
                        textDecoration: 'none',
                      }}
                    >
                      Vergessen?
                    </Link>
                  ) : null
                }
              />
              {tab === 'register' && (
                <FormField
                  label="Schule (optional)"
                  placeholder="Goethe-Gymnasium München"
                  value={school}
                  onChange={setSchool}
                  error={fieldErrors.school}
                />
              )}

              {tab === 'login' && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    color: 'var(--color-ink-700)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                    style={{
                      width: 15,
                      height: 15,
                      accentColor: 'var(--color-primary-600)',
                    }}
                  />
                  Angemeldet bleiben
                </label>
              )}

              {generalError && <InlineNotice tone="error">{generalError}</InlineNotice>}

              <button
                type="submit"
                disabled={busy}
                style={{
                  marginTop: 6,
                  padding: '11px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--color-primary-600)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 120ms ease',
                }}
              >
                {busy && <Spinner spin done={false} />}
                {tab === 'login' ? 'Anmelden' : 'Konto erstellen'}
              </button>

              {tab === 'register' && (
                <p
                  style={{
                    fontSize: 11.5,
                    color: 'var(--color-ink-500)',
                    lineHeight: 1.5,
                    margin: '4px 0 0',
                  }}
                >
                  Mit der Registrierung akzeptierst du die{' '}
                  <a style={{ color: 'var(--color-primary-700)', cursor: 'pointer' }}>AGB</a> und
                  die{' '}
                  <Link
                    to="/datenschutz"
                    style={{
                      color: 'var(--color-primary-700)',
                      textDecoration: 'none',
                    }}
                  >
                    Datenschutz­erklärung
                  </Link>
                  .
                </p>
              )}
            </form>

            <ExtraFieldErrors fieldErrors={fieldErrors} />

            <div
              style={{
                marginTop: 22,
                padding: 12,
                borderRadius: 8,
                background: 'var(--color-bg-app)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-ink-700)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0, marginTop: 1 }}
              >
                <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
              </svg>
              <div>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'var(--color-ink-900)',
                    marginBottom: 2,
                  }}
                >
                  Schul-Lizenz vorhanden?
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-ink-500)',
                    lineHeight: 1.5,
                  }}
                >
                  <a
                    style={{
                      color: 'var(--color-primary-700)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Mit Schul-SSO anmelden
                  </a>
                </div>
              </div>
            </div>
          </div>

          <footer
            style={{
              padding: '14px 36px',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11.5,
              color: 'var(--color-ink-500)',
            }}
          >
            <span>© 2026 WorksheetAI</span>
            <div style={{ display: 'flex', gap: 14 }}>
              <Link to="/impressum" style={{ color: 'inherit', textDecoration: 'none' }}>
                Impressum
              </Link>
              <Link
                to="/datenschutz"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                Datenschutz
              </Link>
            </div>
          </footer>
        </div>
      )}
    </aside>
  );
};

const SsoButton = ({ kind }: { kind: 'google' | 'microsoft' }) => {
  const cfg =
    kind === 'google'
      ? {
          l: 'Google',
          i: (
            <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden>
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.58 2.7-3.9 2.7-6.6z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86a5.27 5.27 0 0 1-4.96-3.65H.98v2.33A9 9 0 0 0 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M4.04 10.77a5.4 5.4 0 0 1 0-3.44V5H.98a9 9 0 0 0 0 8.1l3.06-2.33z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58A9 9 0 0 0 .98 5l3.06 2.33A5.27 5.27 0 0 1 9 3.58z"
              />
            </svg>
          ),
        }
      : {
          l: 'Microsoft',
          i: (
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
              <path fill="#F25022" d="M0 0h7.5v7.5H0z" />
              <path fill="#7FBA00" d="M8.5 0H16v7.5H8.5z" />
              <path fill="#00A4EF" d="M0 8.5h7.5V16H0z" />
              <path fill="#FFB900" d="M8.5 8.5H16V16H8.5z" />
            </svg>
          ),
        };
  return (
    <button
      type="button"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '9px 12px',
        borderRadius: 7,
        border: '1px solid var(--color-border)',
        background: '#fff',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--color-ink-900)',
      }}
    >
      {cfg.i}
      {cfg.l}
    </button>
  );
};

type FormFieldProps = {
  label: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string;
};

const FormField = ({
  label,
  placeholder,
  type = 'text',
  autoComplete,
  hint,
  value,
  onChange,
  error,
}: FormFieldProps) => {
  const invalid = Boolean(error);
  return (
    <label style={{ display: 'block' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 5,
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--color-ink-700)',
          }}
        >
          {label}
        </span>
        {hint}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 7,
          border: `1px solid ${invalid ? '#fca5a5' : 'var(--color-border)'}`,
          background: '#fff',
          fontSize: 13.5,
          color: 'var(--color-ink-900)',
          outline: 'none',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = invalid
            ? '#ef4444'
            : 'var(--color-primary-400)';
          e.currentTarget.style.boxShadow = invalid
            ? '0 0 0 4px rgba(239,68,68,0.12)'
            : '0 0 0 4px rgba(99,102,241,0.12)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = invalid ? '#fca5a5' : 'var(--color-border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
      {error && (
        <div
          style={{
            marginTop: 5,
            fontSize: 12,
            color: '#b91c1c',
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}
    </label>
  );
};

const InlineNotice = ({
  tone,
  children,
}: {
  tone: 'error' | 'warn';
  children: ReactNode;
}) => {
  const palette =
    tone === 'error'
      ? { bg: '#fef2f2', border: '#fecaca', fg: '#991b1b' }
      : { bg: 'var(--color-warn-50)', border: '#fed7aa', fg: 'var(--color-warn-700)' };
  return (
    <div
      role="alert"
      style={{
        padding: '10px 12px',
        borderRadius: 7,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.fg,
        fontSize: 12.5,
        lineHeight: 1.5,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
};

const KNOWN_FIELDS = new Set([
  'email',
  'username',
  'password',
  'password_confirm',
  'first_name',
  'last_name',
  'name',
  'school',
]);

const fieldLabel = (key: string): string => {
  const map: Record<string, string> = {
    email: 'E-Mail',
    username: 'E-Mail',
    password: 'Passwort',
    first_name: 'Vorname',
    last_name: 'Nachname',
    name: 'Name',
    school: 'Schule',
    non_field_errors: 'Formular',
  };
  return map[key] ?? key;
};

const ExtraFieldErrors = ({
  fieldErrors,
}: {
  fieldErrors: Record<string, string>;
}) => {
  const extras = Object.entries(fieldErrors).filter(([k]) => !KNOWN_FIELDS.has(k));
  if (extras.length === 0) return null;
  return (
    <div
      role="alert"
      style={{
        marginTop: 14,
        padding: '10px 12px',
        borderRadius: 7,
        background: 'var(--color-warn-50)',
        border: '1px solid #fed7aa',
        color: 'var(--color-warn-700)',
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {extras.map(([key, msg]) => (
          <li key={key}>
            <span style={{ fontWeight: 600 }}>{fieldLabel(key)}:</span> {msg}
          </li>
        ))}
      </ul>
    </div>
  );
};
