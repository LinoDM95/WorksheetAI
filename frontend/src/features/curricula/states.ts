export type StateOption = {
  slug: string;
  name: string;
  label: string;
  replicate: string[];
};

export const BERLIN_BRANDENBURG_SLUG = 'berlin_brandenburg';
export const BERLIN_BRANDENBURG_DISPLAY = 'Berlin/Brandenburg';

export const FEDERAL_STATE_OPTIONS: StateOption[] = [
  {
    slug: BERLIN_BRANDENBURG_SLUG,
    name: BERLIN_BRANDENBURG_DISPLAY,
    label: 'Berlin & Brandenburg (gemeinsamer RLP)',
    replicate: ['Berlin', 'Brandenburg'],
  },
  { slug: 'baden_wuerttemberg', name: 'Baden-Württemberg', label: 'Baden-Württemberg', replicate: [] },
  { slug: 'bayern', name: 'Bayern', label: 'Bayern', replicate: [] },
  { slug: 'berlin', name: 'Berlin', label: 'Berlin', replicate: [] },
  { slug: 'brandenburg', name: 'Brandenburg', label: 'Brandenburg', replicate: [] },
  { slug: 'bremen', name: 'Bremen', label: 'Bremen', replicate: [] },
  { slug: 'hamburg', name: 'Hamburg', label: 'Hamburg', replicate: [] },
  { slug: 'hessen', name: 'Hessen', label: 'Hessen', replicate: [] },
  { slug: 'mecklenburg_vorpommern', name: 'Mecklenburg-Vorpommern', label: 'Mecklenburg-Vorpommern', replicate: [] },
  { slug: 'niedersachsen', name: 'Niedersachsen', label: 'Niedersachsen', replicate: [] },
  { slug: 'nordrhein_westfalen', name: 'Nordrhein-Westfalen', label: 'Nordrhein-Westfalen', replicate: [] },
  { slug: 'rheinland_pfalz', name: 'Rheinland-Pfalz', label: 'Rheinland-Pfalz', replicate: [] },
  { slug: 'saarland', name: 'Saarland', label: 'Saarland', replicate: [] },
  { slug: 'sachsen', name: 'Sachsen', label: 'Sachsen', replicate: [] },
  { slug: 'sachsen_anhalt', name: 'Sachsen-Anhalt', label: 'Sachsen-Anhalt', replicate: [] },
  { slug: 'schleswig_holstein', name: 'Schleswig-Holstein', label: 'Schleswig-Holstein', replicate: [] },
  { slug: 'thueringen', name: 'Thüringen', label: 'Thüringen', replicate: [] },
];

export const findStateOption = (slug: string): StateOption | undefined =>
  FEDERAL_STATE_OPTIONS.find((o) => o.slug === slug);

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'rlp_kompakt', label: 'RLP kompakt' },
  { value: 'teil_a', label: 'Teil A' },
  { value: 'teil_b', label: 'Teil B' },
  { value: 'teil_c_subject', label: 'Teil C / Fach' },
  { value: 'other', label: 'Sonstiges' },
] as const;
