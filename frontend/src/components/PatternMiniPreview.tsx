/**
 * Mini-Vorschau für Vorlagen-Karten — kein echtes Rendering,
 * sondern stilisierte SVG-/Box-Skizzen je Vorlagentyp.
 */
export type PatternPreviewType =
  | 'rechen'
  | 'sachtext'
  | 'forscher'
  | 'akademisch'
  | 'kreativ';

export const PatternMiniPreview = ({ type }: { type: PatternPreviewType }) => {
  if (type === 'rechen') {
    return (
      <div className="grid w-[130px] grid-cols-3 gap-1">
        {['7+5', '8+4', '6+9', '3+8', '12+5', '7+7', '9+6', '11+4', '5+8'].map((v, i) => (
          <div
            key={i}
            className="grid h-8 place-items-center rounded-sm border border-slate-400 bg-white text-[11px] font-bold text-slate-600"
          >
            {v}
          </div>
        ))}
      </div>
    );
  }
  if (type === 'sachtext') {
    return (
      <div className="w-[140px] text-[8px] text-slate-600">
        <div className="mb-1 h-1 w-3/5 rounded-sm bg-slate-300" />
        <div className="mb-0.5 h-0.5 rounded-sm bg-slate-200" />
        <div className="mb-0.5 h-0.5 rounded-sm bg-slate-200" />
        <div className="mb-0.5 h-0.5 w-[85%] rounded-sm bg-slate-200" />
        <div className="mb-2 h-0.5 w-[70%] rounded-sm bg-slate-200" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-1 flex items-center gap-1">
            <div className="grid h-2 w-2 place-items-center rounded-full border border-slate-400 bg-slate-200 text-[6px] font-bold text-slate-700">
              {i + 1}
            </div>
            <div className="h-1.5 flex-1 border-b border-slate-400" />
          </div>
        ))}
      </div>
    );
  }
  if (type === 'forscher') {
    return (
      <div className="grid w-[140px] grid-cols-2 gap-1">
        {['Beobachtung', 'Vermutung', 'Versuch', 'Auswertung'].map((l) => (
          <div key={l} className="rounded-md border border-slate-300 bg-white p-1">
            <div className="mb-0.5 text-[7px] font-bold text-slate-600">{l}</div>
            <div className="mb-px h-0.5 rounded-[1px] bg-slate-200" />
            <div className="h-0.5 w-3/5 rounded-[1px] bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }
  if (type === 'akademisch') {
    return (
      <div
        className="w-[130px] text-center text-slate-900"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        <div className="text-[6px] uppercase tracking-[0.15em] text-slate-500">Modul VII</div>
        <div className="mt-0.5 text-[9px] font-semibold">Übungsblatt 7</div>
        <div className="my-1 border-y border-slate-900 px-0 py-0.5 text-[6px] text-slate-500">
          24 Punkte · 90 min
        </div>
        <div className="text-left text-[7px]">
          <div className="flex justify-between">
            <b>Aufg. 1</b>
            <span>6 P.</span>
          </div>
          <div className="my-0.5 h-px bg-slate-200" />
          <div className="my-0.5 h-px w-[85%] bg-slate-200" />
          <div className="mt-1 flex justify-between">
            <b>Aufg. 2</b>
            <span>8 P.</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="relative h-[130px] w-[140px]">
      <div className="absolute left-2 right-2 top-0 grid h-4 place-items-center rounded-full border border-slate-300 bg-slate-100 text-[8px] font-bold text-slate-600">
        Forscher-Auftrag
      </div>
      <div className="absolute left-0 right-0 top-6 grid grid-cols-2 gap-1.5">
        {(['bg-slate-50', 'bg-slate-100', 'bg-slate-100', 'bg-slate-50'] as const).map((bg, i) => (
          <div key={i} className={`h-9 rounded-md border border-slate-200 p-1 ${bg}`}>
            <div className="mb-0.5 h-0.5 rounded-[1px] bg-slate-400/35" />
            <div className="h-0.5 w-[70%] rounded-[1px] bg-slate-400/25" />
          </div>
        ))}
      </div>
    </div>
  );
};
