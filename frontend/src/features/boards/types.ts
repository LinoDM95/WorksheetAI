/** Free HTML5 Board — flaches Modell. */

export type LibraryId =
  | 'd3'
  | 'roughjs'
  | 'chartjs'
  | 'leaflet'
  | 'turf'
  | 'topojson'
  | 'interactjs'
  | 'matterjs'
  | 'gsap'
  | 'confetti'
  | 'howler'
  | 'konva';

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

/** Smartboard Pipeline: Quality-Modus (Anzahl/Tiefe der Audits). */
export type QualityMode = 'fast' | 'balanced' | 'full';

/** Smartboard Pipeline: Revisionsmodus für Nachprompten. */
export type RevisionMode =
  | 'general'
  | 'bug_fix'
  | 'design_improve'
  | 'touch_optimize'
  | 'content_change'
  | 'simplify'
  | 'make_more_creative'
  | 'performance_improve';

export type QualitySectionStatus = 'passed' | 'warning' | 'failed';

export type QualitySection = {
  score: number;
  status: QualitySectionStatus;
  issues: string[];
};

export type QualityReport = {
  overall_status: QualitySectionStatus;
  overall_score: number;
  sections: {
    security: QualitySection;
    browser: QualitySection;
    touch: QualitySection;
    design: QualitySection;
    content: QualitySection;
    performance: QualitySection;
  };
  teacher_facing_summary: string;
  warnings: string[];
  suggested_next_actions: string[];
  repair_count?: number;
};

export type IntentAnalysis = {
  subject_area?: string;
  grade_band?: string;
  board_kind?: string;
  interaction_needs?: string[];
  content_needs?: string[];
  recommended_visual_direction?: string;
  recommended_complexity?: string;
  teacher_prompt_summary?: string;
};

export type RiskEntry = {
  type: string;
  level: 'low' | 'medium' | 'high';
  reason?: string;
  mitigation?: string;
};

export type RiskAnalysis = {
  overall_risk?: 'low' | 'medium' | 'high';
  risks?: RiskEntry[];
  complexity?: 'low' | 'medium' | 'high' | 'extreme';
  recommended_generation_strategy?: string;
  should_warn_teacher?: boolean;
  teacher_warning?: string;
};

export type CreativeBrief = {
  board_goal?: string;
  audience?: string;
  learning_goal?: string;
  didactic_flow?: { phase: string; goal: string; interaction: string }[];
  required_interactions?: string[];
  must_have?: string[];
  must_avoid?: string[];
  content_constraints?: string[];
  success_criteria?: string[];
  risks_to_handle?: string[];
};

export type StyleDNA = {
  visual_metaphor?: string;
  mood?: string;
  palette?: {
    background?: string;
    surface?: string;
    primary?: string;
    secondary?: string;
    accent?: string;
    text?: string;
  };
  shape_language?: string;
  motion_language?: string;
  typography_direction?: string;
  layout_principle?: string;
  density?: string;
  age_style?: string;
  interaction_style?: string;
  consistency_rules?: string[];
};

export type TouchAuditResult = {
  ran?: boolean;
  mode?: 'static' | 'playwright' | 'disabled';
  score?: number;
  passed?: boolean;
  threshold_px?: number;
  element_count?: number;
  issues?: { type: string; message: string; severity: 'warning' | 'error'; count?: number; selector?: string }[];
  recommendations?: string[];
};

export type ScreenshotQualityResult = {
  ran?: boolean;
  mode?: 'structured' | 'vision' | 'heuristic';
  reason?: string;
  overall_score?: number;
  scores?: Record<string, number>;
  issues?: string[];
  repair_suggestions?: string[];
  screenshot_path?: string;
};

export type BoardModelConfig = {
  small_model?: string;
  large_model?: string;
  quality_mode?: QualityMode;
  used_pipeline?: boolean;
};

export type BoardFolderBrief = {
  id: string;
  path: string;
};

export type BoardListItem = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  /** Numerischer Bereich 1–13; für Bibliotheksfilter, falls vorhanden. */
  grade_from?: number | null;
  grade_to?: number | null;
  topic: string;
  board_type: string;
  status: string;
  /** Mit in GET /boards/ für Karten-Vorschaubilder (Dashboard, Raster). */
  html: string;
  css: string;
  javascript: string;
  used_libraries: LibraryId[];
  used_datasets?: DatasetId[];
  folder: BoardFolderBrief | null;
  source_board: string | null;
  library_public: boolean;
  /** Keine Freigabe / eingereicht / live in Bibliothek / abgelehnt */
  library_moderation_status?: 'none' | 'pending' | 'approved' | 'rejected';
  student_link_enabled: boolean;
  /** True, wenn der privat gespeicherte Stand von der öffentlichen Bibliotheks-Snapshot unterscheidet sich. */
  library_public_live_differs?: boolean;
  created_at: string;
  updated_at: string;
};

export type BoardDetail = {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade: string;
  grade_from?: number | null;
  grade_to?: number | null;
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
  // Smartboard Pipeline-Artefakte (alle optional / leer für Boards aus alten Pfaden)
  creative_brief?: CreativeBrief;
  style_dna?: StyleDNA;
  intent_analysis?: IntentAnalysis;
  risk_analysis?: RiskAnalysis;
  quality_report?: QualityReport;
  browser_test_result?: { ran?: boolean; errors?: string[]; warnings?: string[]; reason?: string };
  touch_audit_result?: TouchAuditResult;
  screenshot_quality_result?: ScreenshotQualityResult;
  repair_history?: { round: number; mode?: string; ok?: boolean; error_count?: number }[];
  used_model_config?: BoardModelConfig;
  token_usage?: Record<string, number>;
  estimated_cost?: Record<string, number>;
  is_quality_example?: boolean;
  quality_tags?: string[];
  reuse_pattern_summary?: string;
  /** Vom SceneComposer erzeugte Pack-Zusammenfassung (Inline-/URL-Auslieferung pro Asset). */
  assets_summary?: AssetEnginePackSummary;
  folder: BoardFolderBrief | null;
  share_token: string | null;
  student_link_enabled: boolean;
  student_link_expires_at?: string | null;
  library_public: boolean;
  library_moderation_status?: 'none' | 'pending' | 'approved' | 'rejected';
  library_published_at: string | null;
  library_listing_title?: string;
  library_listing_topic?: string;
  library_listing_description?: string;
  /** Öffentliche Bibliothek: Aufgaben, Spiele oder Präsentation (vom Autor gewählt). */
  library_listing_category?: '' | 'tasks' | 'games' | 'presentations';
  library_snapshot_at?: string | null;
  library_public_live_differs?: boolean;
  source_board: string | null;
  avg_rating: number | null;
  rating_count: number;
  my_stars: number | null;
  revision_head_id?: string | null;
  can_revise_with_ai?: boolean;
  created_at: string;
  updated_at: string;
};

export type BoardRevisionMetadata = {
  title?: string;
  description?: string;
  teacher_notes?: string;
  subject?: string;
  topic?: string;
  grade?: string;
  grade_from?: number | null;
  grade_to?: number | null;
  duration_minutes?: number | null;
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
  revision_mode?: RevisionMode;
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
  quality_report_before?: QualityReport;
  quality_report_after?: QualityReport;
  repair_notes?: { round: number; mode?: string; ok?: boolean }[];
  used_model_config?: BoardModelConfig;
  token_usage?: Record<string, number>;
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
  /** Legacy; server befüllt Anzeige aus ``grade_from``/``grade_to``. */
  grade?: string;
  /** Klassenstufen 1–13 (Kreativ-Pflicht). */
  grade_from: number;
  grade_to: number;
  topic: string;
  /** Optional: Anzeigetitel in der eigenen Galerie (schlägt KI-Titel). */
  title?: string;
  board_type?: string;
  duration_minutes?: number;
  creativity?: CreativityLevel;
  visual_style?: VisualStyleId;
  target_device?: string;
  /** Optional; nur gesetzt wenn das Backend einen alternativen Qualitäts-Modus anbietet. */
  ai_quality_tier?: BoardAiQualityTier;
  /** Legacy: wird bei Erstellung nicht mehr ausgewertet (technischer Gen-Pfad). */
  quality_mode?: QualityMode;
  /** Legacy: Asset-Engine ist nicht mehr in der Erstellungs-Pipeline. */
  use_asset_engine?: boolean;
  /** Legacy: siehe use_asset_engine. */
  asset_style_family?: AssetEngineStyleFamilyId | 'auto';
};

export type BoardRevisePayload = {
  prompt: string;
  ai_quality_tier?: BoardAiQualityTier;
  revision_mode?: RevisionMode;
};

export type AutoRepairPayload = {
  revision_mode?: RevisionMode | 'general_repair' | 'bug_fix' | 'design_improve' | 'touch_optimize'
    | 'layout_fix' | 'performance_fix' | 'security_fix' | 'factual_warning';
  hint?: string;
};

export type PipelineStatus = {
  use_pipeline: boolean;
  small_model: string;
  large_model: string;
  default_quality_mode: QualityMode;
  screenshot_judge_enabled: boolean;
  touch_audit_enabled: boolean;
  browser_smoke_test_enabled: boolean;
  creative_brief_enabled: boolean;
  style_dna_enabled: boolean;
  vision_judge_enabled: boolean;
  playwright_available: boolean;
  visual_qa_document_base_configured: boolean;
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
  student_link_valid_minutes?: number | null;
  library_public?: boolean;
  library_listing_title?: string;
  library_listing_topic?: string;
  library_listing_description?: string;
  library_listing_category?: '' | 'tasks' | 'games' | 'presentations';
  library_sync_public_snapshot?: boolean;
  /** Private Arbeitskopie — öffentliche Karte folgt erst nach Freigabe / Snapshot (s. Backend). */
  subject?: string;
  topic?: string;
  /** Nur zusammen mit ``grade_to`` setzen (Klassen 1–13). */
  grade_from?: number;
  grade_to?: number;
  /** Legacy-Freitext; wird ignoriert, wenn ``grade_from``/``grade_to`` gesendet werden. */
  grade?: string;
  /** Minuten 5–90; landet in ``generation_input``. */
  duration_minutes?: number | null;
};

export type BoardLibraryItem = {
  id: string;
  title: string;
  description?: string;
  subject: string;
  grade: string;
  grade_from?: number | null;
  grade_to?: number | null;
  topic: string;
  board_type?: string;
  html: string;
  css: string;
  javascript: string;
  used_libraries: LibraryId[];
  used_datasets?: DatasetId[];
  library_published_at: string | null;
  avg_rating: number | null;
  rating_count: number;
  comment_count: number;
  my_stars: number | null;
  owner_label: string;
  viewer_is_owner: boolean;
  /** Nur für `viewer_is_owner`: Schüler-Link-Token, sonst `null`. */
  share_token?: string | null;
  /** Nur für Owner sinnvoll; für andere Nutzer immer `false`. */
  student_link_enabled?: boolean;
  /** Nur für `viewer_is_owner`; sonst nicht gesendet. */
  student_link_expires_at?: string | null;
  /** Aus `generation_input.duration_minutes` bei freier Smartboard-Generierung; sonst `null`. */
  planned_duration_minutes?: number | null;
  library_listing_category?: '' | 'tasks' | 'games' | 'presentations';
};

export type BoardLibraryCommentDto = {
  id: string;
  text: string;
  created_at: string;
  author_label: string;
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

// ----- Asset Engine -------------------------------------------------------

export type AssetEngineStrategy =
  | 'compiler'
  | 'procedural'
  | 'template_remix'
  | 'svg_free_draw'
  | 'asset_library'
  | 'fallback_simple';

export type AssetEngineBackgroundMode =
  | 'transparent_cutout'
  | 'framed_scene'
  | 'full_background'
  | 'overlay_frame'
  | 'partial_overlay';

export type AssetEngineRole =
  | 'mascot'
  | 'background'
  | 'background_layer'
  | 'scene_object'
  | 'icon'
  | 'badge'
  | 'sticker'
  | 'decoration';

export type AssetEngineDelivery = 'inline' | 'url';

export type AssetEnginePackStatus =
  | 'planned'
  | 'generating'
  | 'ready'
  | 'partially_failed'
  | 'failed'
  | 'archived';

export type AssetEngineStyleFamilyId =
  | 'cute_round_mascot'
  | 'soft_cartoon'
  | 'storybook_flat'
  | 'clean_flat'
  | 'rough_handdrawn'
  | 'classroom_icon'
  | 'science_lab_cartoon'
  | 'historical_atlas'
  | 'sticker_toy';

export type AssetEnginePalette = {
  background?: string;
  surface?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  text?: string;
  outline?: string;
};

export type AssetEngineSummaryEntry = {
  key: string;
  role: AssetEngineRole | string;
  delivery: AssetEngineDelivery;
  width?: number;
  height?: number;
  size_hint?: string;
  inline_svg?: string;
  url?: string;
  background_mode?: AssetEngineBackgroundMode;
  strategy?: AssetEngineStrategy | string;
};

export type AssetEnginePackSummary = {
  pack_id?: string;
  style_family?: AssetEngineStyleFamilyId | string;
  palette?: AssetEnginePalette;
  style_rules?: Record<string, string | number>;
  usage_rules?: string[];
  assets?: AssetEngineSummaryEntry[];
  warnings?: string[];
  consistency_score?: number;
};

export type GeneratedAssetBrief = {
  id: string;
  key: string;
  title?: string;
  asset_type: string;
  strategy: AssetEngineStrategy | string;
  priority: number;
  background_mode: AssetEngineBackgroundMode;
  style_family: AssetEngineStyleFamilyId | string;
  subject_text?: string;
  width?: number;
  height?: number;
  viewbox?: string;
  quality_score?: number;
  is_reusable: boolean;
  tags?: string[];
  download_url: string;
  updated_at: string;
};

export type GeneratedAssetDetail = GeneratedAssetBrief & {
  asset_pack: string | null;
  board: string | null;
  description?: string;
  asset_spec?: Record<string, unknown>;
  svg?: string;
  normalized_svg?: string;
  validation_errors?: string[];
  validation_warnings?: string[];
  quality_report?: Record<string, unknown>;
  repair_history?: { mode?: string; ok?: boolean; note?: string }[];
  metadata?: Record<string, unknown>;
  is_quality_example: boolean;
  usage_count: number;
  created_at: string;
};

export type AssetGenerationJob = {
  id: string;
  asset_key: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'repaired' | 'skipped';
  selected_strategy?: AssetEngineStrategy | string;
  errors?: string[];
  warnings?: string[];
  attempts: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AssetPackBrief = {
  id: string;
  board: string | null;
  name: string;
  style_family: AssetEngineStyleFamilyId | string;
  status: AssetEnginePackStatus;
  quality_score?: number;
  asset_count: number;
  updated_at: string;
};

export type AssetPackDetail = AssetPackBrief & {
  description?: string;
  subject?: string;
  grade?: string;
  topic?: string;
  style_dna?: Record<string, unknown>;
  design_tokens?: Record<string, unknown>;
  palette?: AssetEnginePalette;
  asset_plan?: Record<string, unknown>;
  consistency_report?: Record<string, unknown>;
  warnings?: string[];
  assets: GeneratedAssetBrief[];
  jobs: AssetGenerationJob[];
  created_at: string;
};

export type AssetPackGenerationResponse = {
  pack: AssetPackDetail;
  summary: AssetEnginePackSummary;
};

export const ASSET_STYLE_FAMILY_OPTIONS: { id: AssetEngineStyleFamilyId | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Automatisch (passt zur Style DNA)' },
  { id: 'cute_round_mascot', label: 'Niedliche runde Maskottchen' },
  { id: 'soft_cartoon', label: 'Sanfter Cartoon' },
  { id: 'storybook_flat', label: 'Bilderbuch (flach)' },
  { id: 'clean_flat', label: 'Klar & flach (Sekundarstufe)' },
  { id: 'rough_handdrawn', label: 'Skizziert / Tafel-Look' },
  { id: 'classroom_icon', label: 'Unterrichts-Icons' },
  { id: 'science_lab_cartoon', label: 'Wissenschafts-Cartoon' },
  { id: 'historical_atlas', label: 'Historischer Atlas' },
  { id: 'sticker_toy', label: 'Sticker / Spielzeug' },
];
