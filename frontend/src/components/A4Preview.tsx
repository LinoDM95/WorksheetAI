import { cn } from '../lib/cn';

/**
 * Schlanke A4-Vorschau (Mockup) für Wizard / Editor / Bibliothek.
 * Maße in mm — skaliert via `scale`-Faktor (1 mm ≈ 3.78 px @ 96 dpi).
 *
 * Für die echte Render-Pipeline (Bearbeitung + Druck) wird weiterhin
 * `features/worksheets/A4WorksheetRenderer` genutzt.
 */

export type A4PreviewProps = {
  orientation?: 'portrait' | 'landscape';
  margins?: { top: number; right: number; bottom: number; left: number };
  showGuide?: boolean;
  scale?: number;
  content?: 'demo' | 'math-primary' | 'sachtext' | 'akademisch' | 'empty';
  decoLevel?: 'keine' | 'leicht' | 'mittel' | 'kreativ';
  colorMode?: 'sw' | 'print' | 'dezent' | 'bunt';
  designStyle?: 'klassisch' | 'modern' | 'grundschule' | 'kreativ' | 'akademisch';
  className?: string;
};

const MM_TO_PX = 3.7795;

export const A4Preview = ({
  orientation = 'portrait',
  margins = { top: 12, right: 12, bottom: 12, left: 12 },
  showGuide = true,
  scale = 0.5,
  content = 'demo',
  decoLevel = 'leicht',
  colorMode = 'sw',
  designStyle = 'modern',
  className,
}: A4PreviewProps) => {
  const widthMm = orientation === 'portrait' ? 210 : 297;
  const heightMm = orientation === 'portrait' ? 297 : 210;
  const f = scale * MM_TO_PX;
  const width = widthMm * f;
  const height = heightMm * f;

  const accent =
    colorMode === 'sw'
      ? '#0f172a'
      : colorMode === 'print'
        ? '#1e293b'
        : '#4f46e5';
  const isPrimary = designStyle === 'grundschule';

  return (
    <div
      className={cn('a4-paper shrink-0 relative', className)}
      style={{ width, height }}
      aria-label={`A4-Vorschau ${orientation === 'portrait' ? 'Hochformat' : 'Querformat'}`}
    >
      {showGuide && (
        <div
          className="pointer-events-none absolute rounded-sm"
          style={{
            top: margins.top * f,
            left: margins.left * f,
            right: margins.right * f,
            bottom: margins.bottom * f,
            border: '1px dashed rgba(99,102,241,0.55)',
            background: 'rgba(99,102,241,0.04)',
          }}
        />
      )}
      <div
        className="absolute overflow-hidden"
        style={{
          top: margins.top * f,
          left: margins.left * f,
          right: margins.right * f,
          bottom: margins.bottom * f,
          fontFamily: isPrimary ? '"Comic Neue", "Inter", sans-serif' : 'Inter, sans-serif',
        }}
      >
        {content === 'demo' && (
          <DemoContent
            scale={scale}
            accent={accent}
            designStyle={designStyle}
            colorMode={colorMode}
            decoLevel={decoLevel}
          />
        )}
        {content === 'math-primary' && (
          <PrimaryMathContent scale={scale} colorMode={colorMode} decoLevel={decoLevel} />
        )}
        {content === 'sachtext' && <SachtextContent scale={scale} accent={accent} />}
        {content === 'akademisch' && <AkademischContent scale={scale} />}
        {content === 'empty' && null}
      </div>
    </div>
  );
};

const fsFactor = (scale: number, px: number) => Math.max(6, px * scale * 1.5);

type DemoContentProps = {
  scale: number;
  accent: string;
  designStyle: A4PreviewProps['designStyle'];
  colorMode: A4PreviewProps['colorMode'];
  decoLevel: A4PreviewProps['decoLevel'];
};

const DemoContent = ({ scale, accent, designStyle, colorMode, decoLevel }: DemoContentProps) => {
  const fs = (px: number) => fsFactor(scale, px);
  const isPrimary = designStyle === 'grundschule';
  const isAcademic = designStyle === 'akademisch';
  const showDeco = decoLevel !== 'keine' && colorMode !== 'sw';

  return (
    <div className="h-full text-slate-900" style={{ fontSize: fs(8), lineHeight: 1.4 }}>
      <div
        className="flex items-end justify-between"
        style={{
          borderBottom: `${Math.max(1, scale * 2)}px solid ${isAcademic ? '#0f172a' : accent}`,
          paddingBottom: fs(4),
          marginBottom: fs(8),
        }}
      >
        <div>
          <div
            className="font-semibold uppercase tracking-[0.1em] text-slate-500"
            style={{ fontSize: fs(6) }}
          >
            Mathematik · Klasse 9
          </div>
          <div
            style={{
              fontSize: fs(isPrimary ? 18 : 14),
              fontWeight: 700,
              marginTop: fs(2),
              fontFamily: isAcademic ? 'Georgia, serif' : 'inherit',
            }}
          >
            Lineare Gleichungen
          </div>
        </div>
        <div className="text-right text-slate-500" style={{ fontSize: fs(6) }}>
          Name: ___________________
          <br />
          Datum: __________
        </div>
      </div>

      <div style={{ marginBottom: fs(8) }}>
        <div className="flex items-baseline" style={{ gap: fs(4), marginBottom: fs(3) }}>
          <span
            className="grid place-items-center font-bold text-white"
            style={{
              width: fs(12),
              height: fs(12),
              borderRadius: showDeco ? 4 : 0,
              background: showDeco ? accent : '#0f172a',
              fontSize: fs(7),
            }}
          >
            1
          </span>
          <div style={{ fontWeight: 600, fontSize: fs(8) }}>Löse die folgenden Gleichungen.</div>
        </div>
        <div
          className="grid grid-cols-2"
          style={{ gap: `${fs(3)}px ${fs(8)}px`, paddingLeft: fs(16) }}
        >
          <div>a) 3x + 7 = 22</div>
          <div>b) 5(x − 2) = 15</div>
          <div>c) −2x + 9 = 1</div>
          <div>d) 4x − 7 = 2x + 5</div>
        </div>
      </div>

      <div style={{ marginBottom: fs(8) }}>
        <div className="flex items-baseline" style={{ gap: fs(4), marginBottom: fs(3) }}>
          <span
            className="grid place-items-center font-bold text-white"
            style={{
              width: fs(12),
              height: fs(12),
              borderRadius: showDeco ? 4 : 0,
              background: showDeco ? accent : '#0f172a',
              fontSize: fs(7),
            }}
          >
            2
          </span>
          <div style={{ fontWeight: 600, fontSize: fs(8) }}>Sachaufgabe</div>
        </div>
        <p style={{ margin: `0 0 ${fs(3)}px ${fs(16)}px` }}>
          Eine Bahnfahrt kostet 12 € Grundgebühr plus 0,15 € pro Kilometer. Stelle eine Gleichung
          auf und berechne, wie weit man für 30 € fahren kann.
        </p>
        <div style={{ marginLeft: fs(16) }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ borderBottom: '1px solid #94a3b8', height: fs(10) }} />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-baseline" style={{ gap: fs(4), marginBottom: fs(3) }}>
          <span
            className="grid place-items-center font-bold text-white"
            style={{
              width: fs(12),
              height: fs(12),
              borderRadius: showDeco ? 4 : 0,
              background: showDeco ? accent : '#0f172a',
              fontSize: fs(7),
            }}
          >
            3
          </span>
          <div style={{ fontWeight: 600, fontSize: fs(8) }}>Wertetabelle ergänzen</div>
        </div>
        <table
          style={{
            marginLeft: fs(16),
            borderCollapse: 'collapse',
            fontSize: fs(7),
          }}
        >
          <thead>
            <tr style={{ background: showDeco ? '#f1f5f9' : 'transparent' }}>
              <th style={{ border: '1px solid #94a3b8', padding: `${fs(2)}px ${fs(5)}px` }}>x</th>
              {[-2, -1, 0, 1, 2, 3].map((v) => (
                <th
                  key={v}
                  style={{
                    border: '1px solid #94a3b8',
                    padding: `${fs(2)}px ${fs(5)}px`,
                    fontWeight: 500,
                  }}
                >
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                style={{
                  border: '1px solid #94a3b8',
                  padding: `${fs(2)}px ${fs(5)}px`,
                  fontWeight: 600,
                }}
              >
                y = 2x + 1
              </td>
              {[-2, -1, 0, 1, 2, 3].map((v) => (
                <td key={v} style={{ border: '1px solid #94a3b8', height: fs(10) }} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 flex justify-between text-slate-500"
        style={{
          fontSize: fs(6),
          borderTop: '1px solid #e2e8f0',
          paddingTop: fs(2),
        }}
      >
        <span>Mathematik · Klasse 9</span>
        <span>Seite 1 von 1</span>
      </div>
    </div>
  );
};

const PrimaryMathContent = ({
  scale,
  colorMode,
  decoLevel,
}: {
  scale: number;
  colorMode: A4PreviewProps['colorMode'];
  decoLevel: A4PreviewProps['decoLevel'];
}) => {
  const fs = (px: number) => fsFactor(scale, px);
  const colorful = colorMode === 'bunt' || decoLevel === 'kreativ';
  const accent = colorful ? '#f59e0b' : '#4f46e5';
  return (
    <div
      className="h-full"
      style={{ fontSize: fs(8), lineHeight: 1.4, fontFamily: '"Comic Neue", Inter, sans-serif' }}
    >
      <div className="text-center" style={{ marginBottom: fs(8) }}>
        <div style={{ fontSize: fs(20), fontWeight: 800, color: accent }}>Plus-Aufgaben bis 20</div>
        <div style={{ fontSize: fs(8), color: '#64748b', marginTop: fs(2) }}>
          Name: _______________ Klasse 2 • Datum: _______
        </div>
      </div>
      <div
        className="grid grid-cols-3"
        style={{ gap: `${fs(6)}px ${fs(10)}px` }}
      >
        {[
          '7 + 5 =',
          '8 + 4 =',
          '6 + 9 =',
          '3 + 8 =',
          '12 + 5 =',
          '7 + 7 =',
          '9 + 6 =',
          '11 + 4 =',
          '5 + 8 =',
          '4 + 9 =',
          '13 + 6 =',
          '8 + 8 =',
        ].map((q, i) => (
          <div
            key={i}
            className="text-center font-bold text-slate-900"
            style={{
              border: `${Math.max(1, scale)}px solid ${colorful ? '#fde68a' : '#cbd5e1'}`,
              background: colorful ? '#fffbeb' : '#fff',
              borderRadius: fs(4),
              padding: `${fs(6)}px ${fs(8)}px`,
              fontSize: fs(11),
            }}
          >
            {q} ____
          </div>
        ))}
      </div>
      {colorful && (
        <div
          className="absolute"
          style={{ bottom: fs(10), right: fs(10), fontSize: fs(40), opacity: 0.15 }}
        >
          ★
        </div>
      )}
    </div>
  );
};

const SachtextContent = ({ scale, accent }: { scale: number; accent: string }) => {
  const fs = (px: number) => fsFactor(scale, px);
  return (
    <div className="h-full" style={{ fontSize: fs(7.5), lineHeight: 1.55 }}>
      <div
        style={{
          borderLeft: `${Math.max(2, scale * 3)}px solid ${accent}`,
          paddingLeft: fs(6),
          marginBottom: fs(6),
        }}
      >
        <div
          className="font-semibold uppercase tracking-[0.08em] text-slate-500"
          style={{ fontSize: fs(6) }}
        >
          Deutsch · Lesen
        </div>
        <div style={{ fontSize: fs(13), fontWeight: 700, marginTop: fs(1) }}>
          Die Wanderung der Lachse
        </div>
      </div>
      <p className="text-slate-800" style={{ margin: `0 0 ${fs(4)}px 0` }}>
        Jeden Herbst beginnen Millionen Lachse eine erstaunliche Reise. Sie schwimmen aus dem Meer
        zurück in die Flüsse, in denen sie geboren wurden — manchmal über tausend Kilometer
        flussaufwärts.
      </p>
      <p className="text-slate-800" style={{ margin: `0 0 ${fs(8)}px 0` }}>
        Ihren Heimatfluss erkennen Lachse am Geruch des Wassers. Schon als kleine Fische prägen sie
        sich diesen ein. Nach Jahren im Meer kehren sie genau dorthin zurück.
      </p>
      <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: fs(5) }}>
        <div style={{ fontWeight: 700, marginBottom: fs(4), fontSize: fs(8) }}>Fragen zum Text</div>
        {[
          'Was machen Lachse jeden Herbst?',
          'Wie finden sie ihren Heimatfluss zurück?',
          'Wie lang kann ihre Reise sein?',
        ].map((q, i) => (
          <div key={i} style={{ marginBottom: fs(5) }}>
            <div style={{ fontWeight: 600, marginBottom: fs(1) }}>
              {i + 1}. {q}
            </div>
            <div style={{ borderBottom: '1px solid #94a3b8', height: fs(9) }} />
            <div style={{ borderBottom: '1px solid #94a3b8', height: fs(9), marginTop: fs(2) }} />
          </div>
        ))}
      </div>
    </div>
  );
};

const AkademischContent = ({ scale }: { scale: number }) => {
  const fs = (px: number) => fsFactor(scale, px);
  return (
    <div
      className="h-full"
      style={{ fontSize: fs(7.5), lineHeight: 1.55, fontFamily: 'Georgia, "Times New Roman", serif' }}
    >
      <div className="text-center" style={{ marginBottom: fs(6) }}>
        <div
          className="uppercase tracking-[0.18em] text-slate-600"
          style={{ fontSize: fs(6) }}
        >
          Universität — Modul Analysis II
        </div>
        <div style={{ fontSize: fs(13), fontWeight: 600, marginTop: fs(2) }}>
          Übungsblatt 7 — Mehrdimensionale Integration
        </div>
        <div style={{ fontSize: fs(6), color: '#64748b', marginTop: fs(1) }}>
          Abgabe: 14.05.2026
        </div>
      </div>
      <div
        className="flex justify-between text-slate-600"
        style={{
          borderTop: '1px solid #0f172a',
          borderBottom: '1px solid #0f172a',
          padding: `${fs(2)}px 0`,
          marginBottom: fs(6),
          fontSize: fs(6),
        }}
      >
        <span>Gesamtpunktzahl: 24</span>
        <span>Bearbeitungszeit: 90 min</span>
      </div>
      {[
        { n: 'Aufgabe 1', pts: '6 P.', text: 'Berechnen Sie das Doppelintegral ∫∫_D xy dA über D = {(x,y) : 0 ≤ x ≤ 1, 0 ≤ y ≤ x²}.' },
        { n: 'Aufgabe 2', pts: '8 P.', text: 'Beweisen Sie mittels Polarkoordinaten, dass ∫∫_ℝ² e^(−(x²+y²)) dA = π.' },
        { n: 'Aufgabe 3', pts: '10 P.', text: 'Gegeben sei das Vektorfeld F(x,y,z) = (yz, xz, xy). Zeigen Sie, dass F konservativ ist.' },
      ].map((a, i) => (
        <div key={i} style={{ marginBottom: fs(7) }}>
          <div className="flex items-baseline justify-between" style={{ marginBottom: fs(2) }}>
            <div style={{ fontWeight: 700, fontSize: fs(8) }}>{a.n}</div>
            <div style={{ fontSize: fs(6.5), color: '#64748b' }}>{a.pts}</div>
          </div>
          <p className="m-0 text-slate-800">{a.text}</p>
        </div>
      ))}
    </div>
  );
};
