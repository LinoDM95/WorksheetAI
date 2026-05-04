/**
 * Maschinen-Diagramme für Arbeitsblätter (MVP: unit_circle, right_triangle, coordinate_axes).
 * Koordinaten nur in spec — kein freies SVG/TikZ vom Modell.
 */

import type { ReactNode } from 'react';

export type DiagramKind = 'unit_circle' | 'right_triangle' | 'coordinate_axes';

export type DiagramSpec =
  | {
      kind: 'unit_circle';
      angle_deg?: number;
      show_angle_arc?: boolean;
      show_projections?: boolean;
      point_label?: string;
      radius_label?: string;
    }
  | {
      kind: 'right_triangle';
      right_angle_at: string;
      vertices: Record<string, [number, number]>;
      angle_labels?: Record<string, string>;
      side_labels?: Record<string, string>;
    }
  | {
      kind: 'coordinate_axes';
      x_min: number;
      x_max: number;
      y_min: number;
      y_max: number;
      grid?: boolean;
    };

function num(x: unknown, fallback: number): number {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string' && x.trim() !== '') {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function pair(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const a = num(raw[0], NaN);
  const b = num(raw[1], NaN);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

function normalizeVertices(v: unknown): Record<string, [number, number]> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, [number, number]> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const p = pair(val);
    if (p) out[k.toUpperCase()] = p;
  }
  return out;
}

/** Ecke, deren Winkel am nächsten bei 90° liegt (Datenkoordinaten, nicht Pixel). */
function pickGeometricRightAngleVertex(vertices: Record<string, [number, number]>): string {
  const tri: [string, string, string][] = [
    ['A', 'B', 'C'],
    ['B', 'A', 'C'],
    ['C', 'A', 'B'],
  ];
  let best = 'C';
  let bestD = Infinity;
  for (const [at, o1, o2] of tri) {
    const P = vertices[at];
    const Q = vertices[o1];
    const R = vertices[o2];
    if (!P || !Q || !R) continue;
    const v1: [number, number] = [Q[0] - P[0], Q[1] - P[1]];
    const v2: [number, number] = [R[0] - P[0], R[1] - P[1]];
    const len1 = Math.hypot(v1[0], v1[1]);
    const len2 = Math.hypot(v2[0], v2[1]);
    if (len1 < 1e-9 || len2 < 1e-9) continue;
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (len1 * len2);
    const deg = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
    const d = Math.abs(deg - 90);
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}

/** Robuste Normalisierung aus KI / JSON */
export function normalizeDiagramSpec(raw: unknown): DiagramSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind || '').trim() as DiagramKind;
  if (kind === 'unit_circle') {
    return {
      kind: 'unit_circle',
      angle_deg: num(o.angle_deg, 45),
      show_angle_arc: o.show_angle_arc !== false,
      show_projections: o.show_projections !== false,
      point_label: typeof o.point_label === 'string' ? o.point_label : 'P',
      radius_label: typeof o.radius_label === 'string' ? o.radius_label : undefined,
    };
  }
  if (kind === 'right_triangle') {
    const vertices = normalizeVertices(o.vertices);
    if (Object.keys(vertices).length < 3) return null;
    /** Immer die geometrisch rechte Ecke (vermeidet falschen Thumbsymbol bei KI-Fehlern). */
    const right = pickGeometricRightAngleVertex(vertices);
    const al: Record<string, string> = {};
    if (o.angle_labels && typeof o.angle_labels === 'object') {
      for (const [k, v] of Object.entries(o.angle_labels as Record<string, unknown>)) {
        if (typeof v === 'string') al[k] = v;
      }
    }
    const sl: Record<string, string> = {};
    if (o.side_labels && typeof o.side_labels === 'object') {
      for (const [k, v] of Object.entries(o.side_labels as Record<string, unknown>)) {
        if (typeof v === 'string') sl[k.toUpperCase()] = v;
      }
    }
    return {
      kind: 'right_triangle',
      right_angle_at: right,
      vertices,
      angle_labels: Object.keys(al).length ? al : undefined,
      side_labels: Object.keys(sl).length ? sl : undefined,
    };
  }
  if (kind === 'coordinate_axes') {
    const xMin = num(o.x_min, -5);
    const xMax = num(o.x_max, 5);
    const yMin = num(o.y_min, -4);
    const yMax = num(o.y_max, 4);
    if (xMax <= xMin || yMax <= yMin) return null;
    return {
      kind: 'coordinate_axes',
      x_min: xMin,
      x_max: xMax,
      y_min: yMin,
      y_max: yMax,
      grid: Boolean(o.grid),
    };
  }
  return null;
}

function UnitCircleSvg({ spec }: { spec: Extract<DiagramSpec, { kind: 'unit_circle' }> }) {
  const w = 400;
  const h = 300;
  const cx = 200;
  const cy = 170;
  const r = 85;
  const deg = num(spec.angle_deg, 45);
  const rad = (deg * Math.PI) / 180;
  const Px = cx + r * Math.cos(rad);
  const Py = cy - r * Math.sin(rad);
  const showArc = spec.show_angle_arc !== false;
  const showProj = spec.show_projections !== false;
  const pl = spec.point_label ?? 'P';
  const largeArc = deg > 180 ? 1 : 0;
  const sweep = 0;
  const mkId = `arrow-uc-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full max-w-[400px] text-slate-900" aria-hidden>
      <defs>
        <marker id={mkId} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
        </marker>
      </defs>
      <line
        x1={20}
        y1={cy}
        x2={w - 20}
        y2={cy}
        stroke="currentColor"
        strokeWidth="1.2"
        markerEnd={`url(#${mkId})`}
      />
      <line x1={cx} y1={h - 25} x2={cx} y2={15} stroke="currentColor" strokeWidth="1.2" markerEnd={`url(#${mkId})`} />
      <text x={w - 28} y={cy + 18} className="fill-current text-[12px]" fontFamily="system-ui, sans-serif">
        x
      </text>
      <text x={cx + 8} y={22} className="fill-current text-[12px]" fontFamily="system-ui, sans-serif">
        y
      </text>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {spec.radius_label ? (
        <text
          x={cx + r * 0.35}
          y={cy - r * 0.35}
          className="fill-current text-[11px]"
          fontFamily="system-ui, sans-serif"
        >
          {spec.radius_label}
        </text>
      ) : null}
      <circle cx={Px} cy={Py} r="4" fill="currentColor" />
      <text x={Px + 8} y={Py - 8} className="fill-current text-[13px] font-medium" fontFamily="system-ui, sans-serif">
        {pl}
      </text>
      <line x1={cx} y1={cy} x2={Px} y2={Py} stroke="currentColor" strokeWidth="1" strokeDasharray="4 3" opacity={0.85} />
      {showArc ? (
        <path
          d={`M ${cx + r} ${cy} A ${r} ${r} 0 ${largeArc} ${sweep} ${Px} ${Py}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ) : null}
      {showProj ? (
        <>
          <line x1={Px} y1={Py} x2={Px} y2={cy} stroke="currentColor" strokeWidth="0.9" strokeDasharray="3 3" opacity={0.75} />
          <line x1={Px} y1={Py} x2={cx} y2={Py} stroke="currentColor" strokeWidth="0.9" strokeDasharray="3 3" opacity={0.75} />
          <text
            x={(cx + Px) / 2}
            y={cy + 16}
            className="fill-current text-[11px]"
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
          >
            cos
          </text>
          <text x={Px + 6} y={(cy + Py) / 2} className="fill-current text-[11px]" fontFamily="system-ui, sans-serif">
            sin
          </text>
        </>
      ) : null}
      <text x={cx - 14} y={cy + 18} className="fill-current text-[11px]" fontFamily="system-ui, sans-serif">
        O
      </text>
    </svg>
  );
}

function vecUnit(dx: number, dy: number): [number, number] {
  const h = Math.hypot(dx, dy);
  if (h < 1e-9) return [0, 0];
  return [dx / h, dy / h];
}

/** Lot auf die Kante, nach außen (weg vom Schwerpunkt), für Seitenbeschriftung. */
function edgeLabelPoint(
  pa: [number, number],
  pb: [number, number],
  centroid: [number, number],
  dist: number,
): [number, number] {
  const mx = (pa[0] + pb[0]) / 2;
  const my = (pa[1] + pb[1]) / 2;
  const tdx = pb[0] - pa[0];
  const tdy = pb[1] - pa[1];
  const tlen = Math.hypot(tdx, tdy);
  if (tlen < 1e-9) return [mx, my];
  let nx = -tdy / tlen;
  let ny = tdx / tlen;
  const toCx = centroid[0] - mx;
  const toCy = centroid[1] - my;
  if (nx * toCx + ny * toCy > 0) {
    nx = -nx;
    ny = -ny;
  }
  return [mx + nx * dist, my + ny * dist];
}

function angleBisectorInside(
  pAt: [number, number],
  pO1: [number, number],
  pO2: [number, number],
): [number, number] | null {
  const e1 = vecUnit(pO1[0] - pAt[0], pO1[1] - pAt[1]);
  const e2 = vecUnit(pO2[0] - pAt[0], pO2[1] - pAt[1]);
  return vecUnit(e1[0] + e2[0], e1[1] + e2[1]);
}

const TRI_NB: Record<string, [string, string]> = {
  A: ['B', 'C'],
  B: ['A', 'C'],
  C: ['A', 'B'],
};

function RightTriangleSvg({ spec }: { spec: Extract<DiagramSpec, { kind: 'right_triangle' }> }) {
  const w = 400;
  const h = 280;
  const pad = 40;
  const gw = w - 2 * pad;
  const gh = h - 2 * pad;
  const verts = spec.vertices;
  const coords = Object.values(verts);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const spanX = Math.max(maxX - minX, 0.01);
  const spanY = Math.max(maxY - minY, 0.01);
  const mapX = (x: number) => pad + ((x - minX) / spanX) * gw;
  const mapY = (y: number) => pad + gh - ((y - minY) / spanY) * gh;

  const pt = (k: string): [number, number] | undefined => {
    const v = verts[k];
    return v ? [mapX(v[0]), mapY(v[1])] : undefined;
  };

  const order = ['A', 'B', 'C'];
  const P: Record<string, [number, number]> = {};
  for (const k of order) {
    const p = pt(k);
    if (p) P[k] = p;
  }

  const edgeKey = (a: string, b: string) => `${a}${b}`;
  const sl = spec.side_labels || {};
  const getSideLbl = (a: string, b: string): string | undefined => {
    return sl[edgeKey(a, b)] || sl[edgeKey(b, a)];
  };

  const centroid: [number, number] = [
    ((P.A?.[0] ?? 0) + (P.B?.[0] ?? 0) + (P.C?.[0] ?? 0)) / 3,
    ((P.A?.[1] ?? 0) + (P.B?.[1] ?? 0) + (P.C?.[1] ?? 0)) / 3,
  ];

  /** Ecke mit rechtem Winkel — aus Datenkoordinaten (stimmt mit Geometrie überein). */
  const rightAt = pickGeometricRightAngleVertex(verts);
  const nb = TRI_NB[rightAt];
  let rightSquarePath: string | null = null;
  if (nb && P[rightAt] && P[nb[0]] && P[nb[1]]) {
    const pr = P[rightAt];
    const pn1 = P[nb[0]];
    const pn2 = P[nb[1]];
    const u = vecUnit(pn1[0] - pr[0], pn1[1] - pr[1]);
    const v = vecUnit(pn2[0] - pr[0], pn2[1] - pr[1]);
    const leg1 = Math.hypot(pn1[0] - pr[0], pn1[1] - pr[1]);
    const leg2 = Math.hypot(pn2[0] - pr[0], pn2[1] - pr[1]);
    const marker = Math.min(20, Math.max(11, Math.min(leg1, leg2) * 0.14));
    const p1: [number, number] = [pr[0] + u[0] * marker, pr[1] + u[1] * marker];
    const p2: [number, number] = [pr[0] + u[0] * marker + v[0] * marker, pr[1] + u[1] * marker + v[1] * marker];
    const p3: [number, number] = [pr[0] + v[0] * marker, pr[1] + v[1] * marker];
    rightSquarePath = `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} Z`;
  }

  const angleSym = (k: string) => {
    const low = k.toLowerCase();
    if (low === 'alpha') return 'α';
    if (low === 'beta') return 'β';
    if (low === 'gamma') return 'γ';
    return k;
  };

  const minEdge =
    P.A && P.B && P.C
      ? Math.min(
          Math.hypot(P.B[0] - P.A[0], P.B[1] - P.A[1]),
          Math.hypot(P.C[0] - P.B[0], P.C[1] - P.B[1]),
          Math.hypot(P.A[0] - P.C[0], P.A[1] - P.C[1]),
        )
      : 40;
  const vLabelDist = Math.min(20, Math.max(13, minEdge * 0.08));
  const angleInset = Math.min(26, Math.max(16, minEdge * 0.12));
  const sideOffset = Math.min(16, Math.max(11, minEdge * 0.07));
  const dotR = Math.min(2.75, Math.max(2, minEdge * 0.02));

  const angleLabelPositions: { key: string; x: number; y: number; sym: string }[] = [];
  for (const [angKey, vertLetter] of Object.entries(spec.angle_labels || {})) {
    const V = String(vertLetter).toUpperCase().slice(0, 1);
    const pV = P[V];
    const nbs = TRI_NB[V];
    if (!pV || !nbs || !P[nbs[0]] || !P[nbs[1]]) continue;
    const bis = angleBisectorInside(pV, P[nbs[0]], P[nbs[1]]);
    if (!bis || (bis[0] === 0 && bis[1] === 0)) continue;
    let inset = angleInset;
    if (V === rightAt) inset = Math.min(angleInset + 10, minEdge * 0.22);
    angleLabelPositions.push({
      key: `ang-${angKey}-${V}`,
      x: pV[0] + bis[0] * inset,
      y: pV[1] + bis[1] * inset,
      sym: angleSym(angKey),
    });
  }

  const sideLabels: { x: number; y: number; t: string }[] = [];
  const tryEdge = (a: string, b: string) => {
    const pa = P[a];
    const pb = P[b];
    const lb = getSideLbl(a, b);
    if (!pa || !pb || !lb) return;
    const pos = edgeLabelPoint(pa, pb, centroid, sideOffset);
    sideLabels.push({ x: pos[0], y: pos[1], t: lb });
  };
  tryEdge('A', 'B');
  tryEdge('B', 'C');
  tryEdge('C', 'A');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full max-w-[400px] text-slate-900"
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {P.A && P.B ? <line x1={P.A[0]} y1={P.A[1]} x2={P.B[0]} y2={P.B[1]} /> : null}
        {P.B && P.C ? <line x1={P.B[0]} y1={P.B[1]} x2={P.C[0]} y2={P.C[1]} /> : null}
        {P.C && P.A ? <line x1={P.C[0]} y1={P.C[1]} x2={P.A[0]} y2={P.A[1]} /> : null}
      </g>
      {rightSquarePath ? (
        <path
          d={rightSquarePath}
          fill="rgba(255,255,255,0.35)"
          stroke="currentColor"
          strokeWidth={1}
          strokeLinejoin="miter"
        />
      ) : null}
      {order.map((k) => {
        const p = P[k];
        if (!p) return null;
        const out = vecUnit(p[0] - centroid[0], p[1] - centroid[1]);
        const ox = out[0] === 0 && out[1] === 0 ? 1 : out[0];
        const oy = out[0] === 0 && out[1] === 0 ? 0 : out[1];
        const ou = vecUnit(ox, oy);
        const tx = p[0] + ou[0] * vLabelDist;
        const ty = p[1] + ou[1] * vLabelDist;
        return (
          <g key={k}>
            <circle cx={p[0]} cy={p[1]} r={dotR} fill="#fff" stroke="currentColor" strokeWidth={1} />
            <text
              x={tx}
              y={ty}
              className="fill-current text-[13px] font-semibold"
              fontFamily="system-ui, sans-serif"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {k}
            </text>
          </g>
        );
      })}
      {angleLabelPositions.map((a) => (
        <text
          key={a.key}
          x={a.x}
          y={a.y}
          className="fill-current text-[12.5px]"
          fontFamily="system-ui, 'Segoe UI', sans-serif"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {a.sym}
        </text>
      ))}
      {sideLabels.map((s, i) => (
        <text
          key={`side-${i}-${s.t}`}
          x={s.x}
          y={s.y}
          className="fill-current text-[11.5px]"
          fontFamily="system-ui, sans-serif"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {s.t}
        </text>
      ))}
    </svg>
  );
}

function CoordinateAxesSvg({ spec }: { spec: Extract<DiagramSpec, { kind: 'coordinate_axes' }> }) {
  const w = 400;
  const h = 300;
  const padL = 44;
  const padR = 24;
  const padT = 24;
  const padB = 36;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const { x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax } = spec;
  const sx = iw / (xMax - xMin);
  const sy = ih / (yMax - yMin);
  const mapX = (x: number) => padL + (x - xMin) * sx;
  const mapY = (y: number) => padT + (yMax - y) * sy;
  const ox = mapX(0);
  const oy = mapY(0);
  const mkId = `arrow-ca-${Math.random().toString(36).slice(2, 8)}`;

  const gridLines: ReactNode[] = [];
  if (spec.grid) {
    for (let gx = Math.ceil(xMin); gx <= Math.floor(xMax); gx++) {
      const x = mapX(gx);
      gridLines.push(
        <line key={`gv${gx}`} x1={x} y1={padT} x2={x} y2={h - padB} stroke="currentColor" strokeWidth="0.5" opacity={0.2} />,
      );
    }
    for (let gy = Math.ceil(yMin); gy <= Math.floor(yMax); gy++) {
      const y = mapY(gy);
      gridLines.push(
        <line key={`gh${gy}`} x1={padL} y1={y} x2={w - padR} y2={y} stroke="currentColor" strokeWidth="0.5" opacity={0.2} />,
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full max-w-[400px] text-slate-900" aria-hidden>
      <defs>
        <marker id={mkId} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
        </marker>
      </defs>
      {gridLines}
      <line
        x1={padL}
        y1={oy}
        x2={w - padR}
        y2={oy}
        stroke="currentColor"
        strokeWidth="1.1"
        markerEnd={`url(#${mkId})`}
      />
      <line
        x1={ox}
        y1={h - padB}
        x2={ox}
        y2={padT}
        stroke="currentColor"
        strokeWidth="1.1"
        markerEnd={`url(#${mkId})`}
      />
      <text x={w - padR - 4} y={oy + 18} className="fill-current text-[11px]" fontFamily="system-ui, sans-serif">
        x
      </text>
      <text x={ox + 6} y={padT + 4} className="fill-current text-[11px]" fontFamily="system-ui, sans-serif">
        y
      </text>
    </svg>
  );
}

export function WorksheetDiagramView({ spec }: { spec: DiagramSpec }) {
  if (spec.kind === 'unit_circle') return <UnitCircleSvg spec={spec} />;
  if (spec.kind === 'right_triangle') return <RightTriangleSvg spec={spec} />;
  return <CoordinateAxesSvg spec={spec} />;
}
