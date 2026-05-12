#!/usr/bin/env node
/**
 * Kopiert Sandbox-Libraries aus node_modules nach frontend/public/board-libs/.
 *
 * Lokale Auslieferung ist Pflicht: der iframe ohne `allow-same-origin` darf
 * keine Cross-Origin-CDNs laden, und wir wollen die Boards offline-fähig.
 *
 * Pakete, die nicht installiert sind, werden mit Hinweis übersprungen, damit
 * `npm run build` weiterhin durchläuft.
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const TARGET = join(ROOT, 'public', 'board-libs');
const NM = join(ROOT, 'node_modules');

// Eintrag-Format: [Quelle(n) relativ zu node_modules — erstes existierendes wird genommen, Zieldatei in board-libs/]
const COPIES = [
  [['d3/dist/d3.min.js'], 'd3.min.js'],
  [['chart.js/dist/chart.umd.min.js', 'chart.js/dist/chart.umd.js'], 'chart.umd.min.js'],
  [['roughjs/bundled/rough.min.js', 'roughjs/bundled/rough.js'], 'rough.min.js'],
  [['leaflet/dist/leaflet.js'], 'leaflet.js'],
  [['leaflet/dist/leaflet.css'], 'leaflet.css'],
  [['@turf/turf/turf.min.js'], 'turf.min.js'],
  [['topojson-client/dist/topojson-client.min.js'], 'topojson-client.min.js'],
  [['interactjs/dist/interact.min.js'], 'interact.min.js'],
  [['matter-js/build/matter.min.js'], 'matter.min.js'],
  [['gsap/dist/gsap.min.js'], 'gsap.min.js'],
  [['canvas-confetti/dist/confetti.browser.js'], 'confetti.browser.js'],
  [['howler/dist/howler.min.js'], 'howler.min.js'],
  [['konva/konva.min.js'], 'konva.min.js'],
  [['phaser/dist/phaser.min.js', 'phaser/dist/phaser.js'], 'phaser.min.js'],
  [['pixi.js/dist/pixi.min.js'], 'pixi.min.js'],
];

if (!existsSync(TARGET)) {
  mkdirSync(TARGET, { recursive: true });
}

const result = { copied: [], skipped: [] };

for (const [candidates, dest] of COPIES) {
  const destAbs = join(TARGET, dest);
  const found = candidates.map((c) => join(NM, c)).find((p) => existsSync(p));
  if (!found) {
    result.skipped.push(`${dest} (Quelle ${candidates[0]} nicht gefunden)`);
    continue;
  }
  copyFileSync(found, destAbs);
  result.copied.push(dest);
}

const manifest = {
  generated_at: new Date().toISOString(),
  copied: result.copied,
  skipped: result.skipped,
};
writeFileSync(join(TARGET, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log('[board-libs] kopiert:', result.copied.join(', ') || '— nichts —');
if (result.skipped.length > 0) {
  console.log('[board-libs] übersprungen:', result.skipped.join(', '));
}

if (result.copied.length === 0) {
  console.warn('[board-libs] WARNUNG: Keine Library kopiert. Free-HTML-Sandbox ist ohne d3/rough.');
}
