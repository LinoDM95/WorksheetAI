import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { GenerateWorksheetPayload, Pattern, PageSetup, Worksheet } from '../../types';
import { A4WorksheetRenderer } from '../worksheets/A4WorksheetRenderer';

const emptyPage = (orientation: 'portrait' | 'landscape', m = 12): PageSetup => ({
  format: 'A4',
  orientation,
  unit: 'mm',
  width_mm: orientation === 'portrait' ? 210 : 297,
  height_mm: orientation === 'portrait' ? 297 : 210,
  margins_mm: { top: m, right: m, bottom: m, left: m },
  safe_area: {
    x_mm: m,
    y_mm: m,
    width_mm: (orientation === 'portrait' ? 210 : 297) - 2 * m,
    height_mm: (orientation === 'portrait' ? 297 : 210) - 2 * m,
  },
  renderer: 'html',
});

/** Kurze, verständliche Schritte für Lehrkräfte (ohne KI-Jargon). */
const GENERATION_STATUS_MESSAGES = [
  'Ihre Eingaben werden gesendet',
  'Das Programm lässt das Arbeitsblatt entwerfen',
  'Aufgaben und Texte werden ausformuliert',
  'Inhalt wird auf die Druckseiten verteilt',
  'Die Antwort wird ausgewertet — kann noch etwas dauern',
] as const;

/** Nacheinander 1 → 2 → 3 Punkte, dann alle aus, wieder von vorn. */
const SequentialLoadingDots = ({ active }: { active: boolean }) => {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }
    const id = window.setInterval(() => setPhase((p) => (p + 1) % 4), 420);
    return () => window.clearInterval(id);
  }, [active]);
  if (!active) {
    return null;
  }
  const dotClass = (index: number) => {
    if (phase === 3) {
      return 'opacity-0';
    }
    if (index <= phase) {
      return 'opacity-100';
    }
    return 'opacity-[0.2]';
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 ml-1.5 translate-y-[2px]"
      aria-hidden="true"
    >
      {([0, 1, 2] as const).map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current transition-opacity duration-[180ms] ease-out ${dotClass(
            i,
          )}`}
        />
      ))}
    </span>
  );
};

/** Kurzer Hinweis neben einem Feld: Hover (Desktop), Fokus oder Klick öffnet die Erklärung. */
const FieldInfoTip = ({ ariaLabel, title, children }: { ariaLabel: string; title: string; children: ReactNode }) => {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleDown);
    return () => document.removeEventListener('pointerdown', handleDown);
  }, [open]);

  return (
    <div ref={rootRef} className="group relative inline-flex items-center align-middle">
      <button
        type="button"
        className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-bold leading-none text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      <div
        id={tipId}
        role="tooltip"
        className={`absolute left-0 top-full z-[60] mt-2 w-[min(calc(100vw-2.5rem),22rem)] rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-lg transition-[opacity,visibility,transform] duration-200 sm:left-1/2 sm:w-[22rem] sm:-translate-x-1/2 ${
          open
            ? 'visible translate-y-0 opacity-100'
            : 'invisible -translate-y-0.5 opacity-0 md:group-hover:visible md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:visible md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100'
        } `}
      >
        <p className="mb-2 text-[13px] font-semibold leading-snug text-slate-900">{title}</p>
        <div className="space-y-2 text-xs leading-relaxed text-slate-700">{children}</div>
      </div>
    </div>
  );
};

export function GeneratorPage() {
  const nav = useNavigate();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [topic, setTopic] = useState('Lineare Gleichungen — Übung');
  const [subject, setSubject] = useState('Mathematik');
  const [grade, setGrade] = useState<string>('9');
  const [teacherPrompt, setTeacherPrompt] = useState(
    'Fokus auf Aufgaben mit Parametern, keine Grafikrechner-Aufgaben. Lösungsweg kurz aber korrekt in den solutions festhalten.'
  );
  const [audience, setAudience] = useState('upper_secondary');
  const [difficulty, setDifficulty] = useState('standard');
  const [worksheetType, setWorksheetType] = useState('practice');
  const [tone, setTone] = useState('neutral');
  const [language, setLanguage] = useState('de');
  const [timeBudget, setTimeBudget] = useState<string>('45');
  const [differentiation, setDifferentiation] = useState('');
  const [additionalConstraints, setAdditionalConstraints] = useState('');

  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [linked, setLinked] = useState(true);
  const [m, setM] = useState(12);
  const [margins, setMargins] = useState({ top: 12, right: 12, bottom: 12, left: 12 });
  const [creativity, setCreativity] = useState('minimal_professional');
  const [patternId, setPatternId] = useState('');
  const [loading, setLoading] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generateStatusIndex, setGenerateStatusIndex] = useState(0);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const progressStopRef = useRef(false);
  const [preview, setPreview] = useState<Worksheet | null>(null);
  const [showMarginGuide, setShowMarginGuide] = useState(false);

  useEffect(() => {
    if (!loading) {
      return;
    }
    progressStopRef.current = false;
    setGenerateProgress(0);
    const id = window.setInterval(() => {
      if (progressStopRef.current) {
        return;
      }
      setGenerateProgress((p) => {
        if (p >= 92) {
          return p;
        }
        return Math.min(92, p + (92 - p) * 0.035 + 0.35);
      });
    }, 48);
    return () => window.clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!loading) {
      setGenerateStatusIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setGenerateStatusIndex((i) => (i + 1) % GENERATION_STATUS_MESSAGES.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, [loading]);

  useEffect(() => {
    api.get('/patterns/').then((r) => setPatterns(r.data.results || r.data));
  }, []);
  useEffect(() => {
    if (linked) setMargins({ top: m, right: m, bottom: m, left: m });
  }, [m, linked]);

  const page = useMemo(() => {
    const base = emptyPage(orientation);
    const w = base.width_mm;
    const h = base.height_mm;
    return {
      ...base,
      margins_mm: margins,
      safe_area: {
        x_mm: margins.left,
        y_mm: margins.top,
        width_mm: w - margins.left - margins.right,
        height_mm: h - margins.top - margins.bottom,
      },
    };
  }, [orientation, margins]);

  const gradeNum = grade.trim() === '' ? null : Number(grade);
  const timeNum = timeBudget.trim() === '' ? null : Number(timeBudget);

  const dummy: Worksheet = {
    id: 'preview',
    title: 'A4 Spielwiese',
    subject,
    grade: gradeNum,
    topic,
    page_setup: page,
    content: {},
    render_model: {
      title: 'A4 Spielwiese',
      subtitle: 'Live-Randvorschau',
      page_setup: page,
      presentation: {
        register: 'neutral',
        text_scale: 'md',
        task_text_scale: 'md',
        heading_scale: '2xl',
        line_height: 'normal',
        density: 'normal',
        planning_rationale: 'Vorschau — Nutzung von Typografie/Dichte über presentation der KI; kein Farb-Deko.',
      },
      tokens: {
        palette: { primary: '#111827', secondary: '#525252', soft: '#ffffff', accent: '#525252' },
        presentation: {
          register: 'neutral',
          text_scale: 'md',
          task_text_scale: 'md',
          heading_scale: '2xl',
          line_height: 'normal',
          density: 'normal',
        },
      },
      pages: [
        {
          page_label: '',
          blocks: [
            {
              id: 'p1',
              type: 'text',
              title: 'Inhaltsbereich',
              content:
                'Die KI nutzt Lehrer-Kontext, Niveau, Zeitbudget und Sprache. Bei Bedarf mehrere A4-Seiten im selben Layout. Schriftgrößen kommen aus dem Feld presentation der KI-Antwort.',
            },
          ],
        },
      ],
    },
    status: 'draft',
  } as Worksheet;

  async function generate() {
    setGenerateError(null);
    setLoading(true);
    try {
      const payload: GenerateWorksheetPayload = {
        topic,
        subject_name: subject,
        grade_value: Number.isFinite(gradeNum as number) ? gradeNum : null,
        teacher_prompt: teacherPrompt,
        audience,
        difficulty,
        worksheet_type: worksheetType,
        tone,
        language,
        time_budget_minutes: Number.isFinite(timeNum as number) ? timeNum : null,
        differentiation,
        additional_constraints: additionalConstraints,
        creativity,
        theme: 'minimal',
        page_setup: page,
        pattern_id: patternId || undefined,
        use_pattern_matching: !patternId,
      };
      const r = await api.post('/worksheets/generate/', payload);
      progressStopRef.current = true;
      setGenerateProgress(100);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 280));
      const ws = r.data as Worksheet;
      setPreview(ws);
      nav(`/app/worksheets/${ws.id}`);
    } catch (err) {
      progressStopRef.current = true;
      setGenerateProgress(0);
      let message = 'Generierung fehlgeschlagen.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as Record<string, unknown> | undefined;
        if (typeof d?.detail === 'string') {
          message = d.detail;
        } else if (d && typeof d === 'object') {
          const first = Object.entries(d).find(([, v]) => typeof v === 'string' || Array.isArray(v));
          if (first) {
            const [, v] = first;
            message = Array.isArray(v) ? String(v[0]) : String(v);
          }
        } else if (err.message) {
          message = err.message;
        }
      } else if (err instanceof Error && err.message) {
        message = err.message;
      }
      setGenerateError(message);
    } finally {
      setLoading(false);
      setGenerateProgress(0);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(380px,480px)_1fr] gap-8">
      <div className="no-print bg-white rounded-2xl shadow p-6 h-fit max-h-[calc(100vh-3rem)] overflow-y-auto">
        <h1 className="text-2xl font-bold mb-4">Arbeitsblatt generieren</h1>

        <div className="mb-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
          <label htmlFor="generator-teacher-prompt" className="text-sm font-semibold text-slate-800">
            Kontext für die KI (Lehrer-Prompt)
          </label>
          <FieldInfoTip
            ariaLabel="Hilfe: Lehrer-Prompt — wie Sie das Arbeitsblatt steuern"
            title="So nutzen Sie dieses Feld am besten"
          >
            <p>
              Hier schreiben Sie in <strong>freien Sätzen</strong>, was auf dem Blatt wichtig ist. Dieser Text wird der
              KI wie ein <strong>Kurzbriefing vom Lehrer</strong> übergeben — mit{' '}
              <strong>Vorrang vor Vorlagen</strong>, falls etwas widerspricht. Sie müssen keine Technik-Begriffe kennen.
            </p>
            <p>
              <strong>Gut geeignet:</strong> didaktischer Schwerpunkt, typische Missverständnisse Ihrer Klasse, klare
              Tabus (z.&nbsp;B. „kein Grafikrechner“, „keine Multiple Choice“, „nur Sachaufgaben“), wie lösungsorientiert
              die Musterlösungen sein sollen.
            </p>
            <p>
              <strong>Zusammen mit den Feldern darunter:</strong> Fach, Klasse, Zielgruppe und Zeit sind strukturierte
              Angaben — der große Textfeld-Kontext ergänzt das mit Ihrer <strong>Unterrichtspraxis</strong>. Wenn Sie
              hier nichts eintragen, arbeitet das Programm nur mit diesen strukturierten Angaben.
            </p>
          </FieldInfoTip>
        </div>
        <p className="text-xs text-slate-500 mb-1">
          Didaktik, Schwierigkeiten der Lerngruppe, Tabus, gewünschte Aufgabentypen, Bezug zum Lehrplan — alles,
          was sich nicht in ein kurzes Dropdown fassen lässt.
        </p>
        <textarea
          id="generator-teacher-prompt"
          className="border border-slate-300 rounded-lg w-full min-h-[140px] p-2 text-sm mb-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          value={teacherPrompt}
          onChange={(e) => setTeacherPrompt(e.target.value)}
          placeholder="z. B. Fokus auf …, vermeide …, Lösungen möglichst knapp / ausführlich, Bezug zu Lernstand …"
        />

        <label className="text-sm font-semibold">Thema (Kurztitel)</label>
        <input
          className="border border-slate-300 rounded-lg p-2 w-full mb-3"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-semibold">Fach / Kurs</label>
            <input
              className="border border-slate-300 rounded-lg p-2 w-full"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-semibold">Klasse / Jahr (optional)</label>
            <input
              className="border border-slate-300 rounded-lg p-2 w-full"
              type="text"
              inputMode="numeric"
              placeholder="z. B. 9 oder leer"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Wird in der <strong>Fußzeile</strong> jeder Seite angezeigt — sollte zum Thema passen (z.&nbsp;B. Geschichte bei Napoleon, nicht ein anderes Fach aus Gewohnheit).
        </p>

        <h2 className="text-sm font-bold text-slate-700 mt-5 mb-2 uppercase tracking-wide">Zielgruppe & Format</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Zielgruppe</label>
            <select
              className="border border-slate-300 rounded-lg p-2 w-full text-sm"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option value="primary">Grundschule</option>
              <option value="lower_secondary">Sek I / MS</option>
              <option value="upper_secondary">Sek II / Gymnasium</option>
              <option value="vocational">Berufliche Schule</option>
              <option value="adult">Erwachsenenbildung</option>
              <option value="university">Hochschule</option>
              <option value="professional">Betrieb / Training</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Arbeitsblatt-Typ</label>
            <select
              className="border border-slate-300 rounded-lg p-2 w-full text-sm"
              value={worksheetType}
              onChange={(e) => setWorksheetType(e.target.value)}
            >
              <option value="practice">Üben / Festigen</option>
              <option value="introduction">Einstieg / Erkunden</option>
              <option value="homework">Hausaufgabe</option>
              <option value="quiz">Kurztest / Quiz</option>
              <option value="exam_prep">Prüfungsvorbereitung</option>
              <option value="exam_style">Probeklausur (zeitnah)</option>
              <option value="reflection">Reflexion / Portfolio</option>
              <option value="station_work">Stationen / Gruppenarbeit</option>
              <option value="mixed">Gemischt (KI entscheidet sinnvoll)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Niveau / Anspruch</label>
            <select
              className="border border-slate-300 rounded-lg p-2 w-full text-sm"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="basic">Grundlegend</option>
              <option value="standard">Standard</option>
              <option value="advanced">Anspruchsvoll</option>
              <option value="expert">Experte / Wettbewerb</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Sprache der Aufgaben</label>
            <select
              className="border border-slate-300 rounded-lg p-2 w-full text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="de">Deutsch</option>
              <option value="de_simple">Deutsch (einfache Sprache)</option>
              <option value="en">Englisch</option>
              <option value="fr">Französisch</option>
              <option value="es">Spanisch</option>
              <option value="mixed_bilingual">Zweisprachig (KI wählt sinnvoll)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Ton / Du-Sie</label>
            <select
              className="border border-slate-300 rounded-lg p-2 w-full text-sm"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              <option value="neutral">Sachneutral</option>
              <option value="formal">Formell (Sie)</option>
              <option value="supportive">Ermutigend / wertschätzend</option>
              <option value="concise">Knapp / Prüfungsstil</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Zeitbudget (Min., optional)</label>
            <input
              className="border border-slate-300 rounded-lg p-2 w-full text-sm"
              type="text"
              inputMode="numeric"
              placeholder="z. B. 45"
              value={timeBudget}
              onChange={(e) => setTimeBudget(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
          <label htmlFor="generator-differentiation" className="text-xs font-semibold text-slate-600">
            Differenzierung / Niveaustufen
          </label>
          <FieldInfoTip
            ariaLabel="Hilfe: Differenzierung — was hier hinkommt"
            title="Unterschied zum großen Textfeld oben"
          >
            <p>
              Hier reicht ein <strong>kompakter Merker</strong>: Welche Gruppen oder Niveaus sollen berücksichtigt
              werden? Das System übergibt das als <strong>eigenes Feld</strong> an die KI — sie soll daraus{' '}
              <strong>sichtbare Aufgabenvarianten, Zusatztipps oder getrennte Schwierigkeitsstufen</strong> im Blatt machen,
              nicht nur einen leeren Satz.
            </p>
            <p>
              <strong>Beispiele:</strong> „Starke: Aufgabe mit Parameter; schwache: kleiner Zahlenraum, Lückenhilfen.“ /
              „Aufgabe A für schnelle, Aufgabe B für ruhiges Arbeiten.“
            </p>
            <p>
              Die <strong>große Erklärung</strong> zur Methode oder Ihrem Unterricht bleibt sinnvollerweise im{' '}
              <strong>Lehrer-Prompt oben</strong>; hier nur die <strong>Niveau-Zuordnung</strong>, damit nichts
              untergeht.
            </p>
          </FieldInfoTip>
        </div>
        <input
          id="generator-differentiation"
          className="border border-slate-300 rounded-lg p-2 w-full text-sm mb-2"
          value={differentiation}
          onChange={(e) => setDifferentiation(e.target.value)}
          placeholder="Optional: kurz A/B-Niveau, Zusatz für starke/schwache Schüler:innen …"
        />

        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
          <label htmlFor="generator-constraints" className="text-xs font-semibold text-slate-600">
            Weitere Randbedingungen
          </label>
          <FieldInfoTip
            ariaLabel="Hilfe: Weitere Randbedingungen"
            title="Wofür dieses Feld gedacht ist"
          >
            <p>
              Hier notieren Sie <strong>harte Regeln oder Pflichten</strong>, die schnell klar sein müssen: z.&nbsp;B.
              „ohne Taschenrechner“, „nur ganze Zahlen“, „Quelle angeben“, „keine Abbildungen nötig“, „Zeitlimit im
              Unterricht beachten“.
            </p>
            <p>
              Diese Angaben werden wie die Differenzierung <strong>mitgeschickt</strong> und sollen im{' '}
              <strong>konkreten Aufgabenwortlaut</strong> wiederzufinden sein — nicht nur am Rand erwähnt werden.
            </p>
            <p>
              <strong>Nicht doppelt schreiben:</strong> Ihre allgemeine didaktische Absicht steht oben im Lehrer-Prompt;
              hier nur <strong>scharf umrissene Verbote oder Muss-Kriterien</strong>, die sonst verloren gehen könnten.
            </p>
          </FieldInfoTip>
        </div>
        <input
          id="generator-constraints"
          className="border border-slate-300 rounded-lg p-2 w-full text-sm mb-3"
          value={additionalConstraints}
          onChange={(e) => setAdditionalConstraints(e.target.value)}
          placeholder="z. B. ohne Taschenrechner, nur Buchstabieren, Quellenangabe verlangen, …"
        />

        <label className="text-sm font-semibold">Vorlage</label>
        <select
          className="border border-slate-300 rounded-lg p-2 w-full mb-3"
          value={patternId}
          onChange={(e) => setPatternId(e.target.value)}
        >
          <option value="">Automatisch auswählen</option>
          {patterns.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <h2 className="text-sm font-bold text-slate-700 mt-4 mb-2 uppercase tracking-wide">Seite & Abstände</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Ausrichtung</label>
            <select
              className="border border-slate-300 rounded-lg p-2 w-full text-sm"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
            >
              <option value="portrait">Hochformat</option>
              <option value="landscape">Querformat</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Absätze & Abstände</label>
            <select
              className="border border-slate-300 rounded-lg p-2 w-full text-sm"
              value={creativity}
              onChange={(e) => setCreativity(e.target.value)}
            >
              <option value="classic">Kompakt</option>
              <option value="minimal_professional">Sachlich, etwas Luft</option>
              <option value="balanced">Standard-Abstände</option>
            </select>
          </div>
          <p className="col-span-2 text-xs text-slate-500">
            Das Arbeitsblatt wird <strong>ohne Farb- oder Form-Deko</strong> gedruckt — nur Struktur und Text.
          </p>
        </div>

        <div className="mt-4">
          <label className="flex gap-2 items-center text-sm">
            <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
            Ränder koppeln
          </label>
          {linked ? (
            <>
              <label className="text-sm font-semibold mt-2 block">Rand: {m} mm</label>
              <input
                type="range"
                min={5}
                max={30}
                value={m}
                onChange={(e) => setM(Number(e.target.value))}
                className="w-full"
              />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
                <label key={k} className="text-xs font-semibold">
                  {k}
                  <input
                    type="number"
                    className="border border-slate-300 p-1 rounded w-full"
                    value={margins[k]}
                    onChange={(e) => setMargins({ ...margins, [k]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {loading ? GENERATION_STATUS_MESSAGES[generateStatusIndex] : ''}
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={generate}
            aria-busy={loading}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={loading ? Math.round(generateProgress) : undefined}
            className="relative w-full overflow-hidden rounded-xl border border-indigo-600/30 bg-indigo-100 px-4 py-3 text-left font-bold shadow-sm transition-shadow hover:shadow disabled:cursor-not-allowed disabled:opacity-90"
          >
            <span
              className="pointer-events-none absolute inset-y-0 left-0 bg-indigo-600 transition-[width] duration-100 ease-linear"
              style={{ width: `${loading ? generateProgress : 100}%` }}
              aria-hidden
            />
            <span
              className={`relative z-10 flex min-h-[2.75rem] flex-wrap items-center justify-center gap-x-0 gap-y-0 px-1 text-center transition-colors duration-150 ${
                !loading || generateProgress > 88
                  ? 'text-white [text-shadow:0_1px_2px_rgb(0_0_0/40%)]'
                  : 'text-indigo-950'
              } ${loading ? 'text-sm leading-snug sm:text-[0.95rem]' : 'text-base'}`}
            >
              {loading ? (
                <>
                  <span>{GENERATION_STATUS_MESSAGES[generateStatusIndex]}</span>
                  <SequentialLoadingDots active />
                </>
              ) : (
                'Mit KI generieren'
              )}
            </span>
          </button>
          {generateError ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {generateError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white print:border-0 print:rounded-none">
        <label className="no-print mx-3 mt-3 mb-2 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showMarginGuide}
            onChange={(e) => setShowMarginGuide(e.target.checked)}
          />
          Rand-Hilfslinie (nur Bildschirm, nicht im PDF)
        </label>
        <A4WorksheetRenderer worksheet={preview || dummy} showGuide={showMarginGuide} />
      </div>
    </div>
  );
}
