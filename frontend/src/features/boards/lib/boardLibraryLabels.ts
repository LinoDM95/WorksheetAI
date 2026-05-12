import type { LibraryId } from '../types';

/** Feste Reihenfolge für Technik-Filter in der Bibliothek (alle erlaubten Sandbox-Libs). */
export const BOARD_LIBRARY_TECH_FILTER_IDS: LibraryId[] = [
  'chartjs',
  'confetti',
  'd3',
  'gsap',
  'howler',
  'interactjs',
  'konva',
  'leaflet',
  'matterjs',
  'phaser',
  'pixi',
  'roughjs',
  'topojson',
  'turf',
];

export const LIBRARY_TECH_LABELS: Record<LibraryId, string> = {
  d3: 'D3',
  roughjs: 'Rough.js',
  chartjs: 'Chart.js',
  leaflet: 'Karte',
  turf: 'Turf',
  topojson: 'TopoJSON',
  interactjs: 'Interact.js',
  matterjs: 'Matter.js',
  gsap: 'GSAP',
  confetti: 'Canvas-Confetti',
  howler: 'Howler',
  konva: 'Konva',
  phaser: 'Phaser',
  pixi: 'PixiJS',
};
