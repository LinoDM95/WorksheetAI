import { Alert, Card } from '../../../../components/ui';
import type { AssetId, DatasetId, LibraryId } from '../../types';

type Props = {
  usedLibraries: LibraryId[];
  usedAssets: AssetId[];
  usedDatasets: DatasetId[];
  warnings?: string[];
};

const LIBRARY_LABELS: Record<LibraryId, string> = {
  d3: 'd3 — Visualisierung & SVG (immer geladen)',
  roughjs: 'rough — handgezeichnete Optik (immer geladen)',
  chartjs: 'Chart.js — Canvas-Diagramme & kleine Dashboards (optional)',
  leaflet: 'Leaflet — interaktive Karten',
  turf: 'Turf — Geo-Berechnungen',
  topojson: 'TopoJSON-Client — TopoJSON entpacken',
  interactjs: 'Interact.js — Touch-Drag / Resize / Mehrfinger-Geste (DOM)',
  matterjs: 'Matter.js — 2D-Physik (Canvas)',
  gsap: 'GSAP — Timelines & flüssige Bewegung (Core, kein Club-Plugin)',
  confetti: 'canvas-confetti — Konfetti / Belohnung',
  howler: 'Howler — Sound (lokale Audiodateien unter /board-assets/…)',
  konva: 'Konva — 2D-Canvas-Staging (Mindmaps, viele Knoten)',
  phaser: 'Phaser — HTML5-Spiel-Framework (Szenen, Sprites, Arcade)',
  pixi: 'PixiJS — WebGL/Canvas-2D-Renderer (PIXI)',
};

const SectionList = ({ title, items, emptyHint }: { title: string; items: string[]; emptyHint: string }) => (
  <Card className="!p-4">
    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
    {items.length === 0 ? (
      <p className="text-sm text-slate-500">{emptyHint}</p>
    ) : (
      <ul className="space-y-1 text-sm text-slate-800">
        {items.map((id) => (
          <li key={id} className="flex items-start gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden />
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{id}</code>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

export const FreeHtmlResourcesPanel = ({
  usedLibraries,
  usedAssets,
  usedDatasets,
  warnings,
}: Props) => {
  const libLabels = (usedLibraries || []).map((id) => LIBRARY_LABELS[id] ?? id);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Die KI darf ausschließlich diese lokalen Ressourcen nennen. Externe URLs sind in der Sandbox geblockt.
      </p>
      <SectionList
        title="Genutzte Libraries"
        items={libLabels}
        emptyHint="Keine zusätzlichen Libraries — nur Vanilla JS."
      />
      <SectionList
        title="Genutzte Assets (Icons)"
        items={usedAssets}
        emptyHint="Keine Assets referenziert."
      />
      <SectionList
        title="Genutzte Datasets"
        items={usedDatasets}
        emptyHint="Keine Datasets referenziert."
      />
      {warnings && warnings.length > 0 && (
        <Alert tone="warn">
          <p className="mb-1 text-sm font-semibold">Hinweise vom Server / Modell</p>
          <ul className="list-inside list-disc text-sm">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
};
