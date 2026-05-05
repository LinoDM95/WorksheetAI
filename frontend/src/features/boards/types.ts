/** Free HTML5 Tafelbild — flaches Modell. */

export type LibraryId = 'd3' | 'roughjs' | 'chartjs' | 'leaflet' | 'turf' | 'topojson';

export type AssetId = string;

export type DatasetId = string;

export type VisualStyleId =
  | 'auto'
  | 'primary_school_playful'
  | 'history_atlas'
  | 'museum'
  | 'science_lab'
  | 'math_grid'
  | 'chalkboard'
  | 'documentary'
  | 'free_creative';

export type CreativityLevel = 'kontrolliert' | 'ausgewogen' | 'experimentell';

/** Optional alternative quality tier (API). */
export type BoardAiQualityTier = 'standard' | 'ultra';

export type BoardFolderBrief = {
  id: string;
  path: string;
};

export type BoardListItem = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  topic: string;
  board_type: string;
  status: string;
  used_libraries: LibraryId[];
  folder: BoardFolderBrief | null;
  source_board: string | null;
  library_public: boolean;
  student_link_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type BoardDetail = {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade: string;
  topic: string;
  board_type: string;
  status: string;
  html: string;
  css: string;
  javascript: string;
  teacher_notes: string;
  usage_instructions: string[];
  warnings: string[];
  used_libraries: LibraryId[];
  used_assets: AssetId[];
  used_datasets: DatasetId[];
  generation_prompt: string;
  generation_input: Record<string, unknown>;
  validation_errors: string[];
  validation_warnings: string[];
  folder: BoardFolderBrief | null;
  share_token: string | null;
  student_link_enabled: boolean;
  library_public: boolean;
  library_published_at: string | null;
  source_board: string | null;
  avg_rating: number | null;
  rating_count: number;
  my_stars: number | null;
  created_at: string;
  updated_at: string;
};

export type BoardRevisionMetadata = {
  title?: string;
  description?: string;
  teacher_notes?: string;
  usage_instructions?: string[];
  warnings?: string[];
  used_libraries?: LibraryId[];
  used_assets?: AssetId[];
  used_datasets?: DatasetId[];
};

export type BoardRevision = {
  id: string;
  board: string;
  prompt: string;
  previous_html: string;
  previous_css: string;
  previous_javascript: string;
  new_html: string;
  new_css: string;
  new_javascript: string;
  previous_metadata: BoardRevisionMetadata;
  new_metadata: BoardRevisionMetadata;
  validation_errors: string[];
  validation_warnings: string[];
  created_at: string;
  created_by: number | null;
};

export type BoardFolderDto = {
  id: string;
  parent: string | null;
  name: string;
  sort_order: number;
  path: string;
};

export type BoardGeneratePayload = {
  prompt: string;
  subject?: string;
  grade?: string;
  topic?: string;
  board_type?: string;
  duration_minutes?: number;
  creativity?: CreativityLevel;
  visual_style?: VisualStyleId;
  target_device?: string;
  /** Optional; nur gesetzt wenn das Backend einen alternativen Qualitäts-Modus anbietet. */
  ai_quality_tier?: BoardAiQualityTier;
};

export type BoardCodeUpdate = {
  html?: string;
  css?: string;
  javascript?: string;
  title?: string;
  description?: string;
  teacher_notes?: string;
  usage_instructions?: string[];
  warnings?: string[];
  /** Galerie-Ordner; `null` entfernt die Zuordnung. */
  folder_id?: string | null;
  student_link_enabled?: boolean;
  library_public?: boolean;
};

export type BoardLibraryItem = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  topic: string;
  used_libraries: LibraryId[];
  library_published_at: string | null;
  avg_rating: number | null;
  rating_count: number;
  my_stars: number | null;
  owner_label: string;
};

export type BoardValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

// ----- Bausteinmodus -------------------------------------------------------

export type BlockCategoryId = 'universal' | 'sprache' | 'diskussion' | 'diagramme' | 'mathematik';

export type BlockThemeId = 'auto' | 'primary_school' | 'museum' | 'science' | 'chalkboard';

export type BlockRegistryEntry = {
  id: string;
  label: string;
  category: BlockCategoryId | string;
  size_weight: 1 | 2 | 3;
  help_text: string;
  content_schema: Record<string, unknown>;
  default_content: Record<string, unknown>;
};

export type BlockCategory = { id: string; label: string };

export type BlockTheme = { id: string; label: string; description: string };

export type BlockRegistryResponse = {
  blocks: BlockRegistryEntry[];
  categories: BlockCategory[];
  themes: BlockTheme[];
};

/** Slot im Plan: KI füllt den Inhalt — der Lehrer wählt nur Typ + optionalen Hint. */
export type BlockSlot = {
  /** Stabile Builder-ID, vom Frontend vergeben. */
  instance_id: string;
  block_id: string;
  /** Optionaler kurzer Hinweis nur für diesen Slot (z. B. „bitte Merksatz formulieren"). */
  hint: string;
};

export type PagePlan = {
  title: string;
  /** Stichpunktartige Themen-Hinweise an die KI für diese Seite. */
  bullets: string[];
  block_slots: BlockSlot[];
};

export type CompositionPlan = {
  subject: string;
  grade: string;
  topic: string;
  title: string;
  /** Optionale Stilrichtung in einem Satz (z. B. „kindgerecht, freundlich"). */
  style_hint: string;
  theme_id: BlockThemeId | string;
  pages: PagePlan[];
};

export const BLOCKS_PAGE_BLOCK_LIMIT = 6;
export const BLOCKS_PAGE_UNIT_BUDGET = 10;
export const BLOCKS_MAX_PAGES = 12;
export const BLOCKS_MAX_PAGE_BULLETS = 20;
/** Pro Stichpunkt-Zeile (Server: MAX_BULLET_LEN). */
export const BLOCKS_MAX_BULLET_LEN = 300;
