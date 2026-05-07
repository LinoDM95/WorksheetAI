export type PageSetup={format:'A4';orientation:'portrait'|'landscape';unit:'mm';width_mm:number;height_mm:number;margins_mm:{top:number;right:number;bottom:number;left:number};safe_area:{x_mm:number;y_mm:number;width_mm:number;height_mm:number};renderer:'html'};

export type CurriculumUsagePanelPayload =
  | {
      has_curriculum_context: true;
      usage: {
        state?: string | null;
        subject?: string | null;
        grade_band?: string | null;
        topic_area?: string | null;
        subtopics?: string[];
        competency_goals?: string[];
        allowed_task_types?: string[];
        validation_rules?: string[];
        sources?: unknown[];
        quality_status?: string | null;
        match_reasons?: string[];
        match_score?: number | null;
        ai_usage_note?: string;
        curriculum_alignment?: Record<string, unknown>;
        title?: string | null;
        short_description?: string | null;
        source_label?: string | null;
      };
    }
  | {
      has_curriculum_context: false;
      usage: null;
      warning?: string;
    };

export type Worksheet={
  id:string;
  title:string;
  subject:string;
  grade:number|null;
  topic:string;
  page_setup:PageSetup;
  content:any;
  render_model:any;
  pattern_name?:string;
  status?:string;
  updated_at?:string;
  generation_meta?: Record<string, unknown>;
  curriculum_warning?: string | null;
  curriculum_show_usage?: boolean;
  curriculum_usage_panel?: CurriculumUsagePanelPayload;
  library_public?: boolean;
  library_listing_title?: string;
  library_listing_topic?: string;
  library_listing_description?: string;
  library_moderation_status?: 'none' | 'pending' | 'approved' | 'rejected';
  library_published_at?: string | null;
  viewer_is_owner?: boolean;
};

/** Öffentlicher Arbeitsblatt-Katalog (/worksheets/library/). */
export type WorksheetLibraryItem={
  kind:'worksheet';
  id:string;
  title:string;
  subject:string;
  grade:string;
  topic:string;
  /** Öffentliche Kurzbeschreibung für die Bibliothekskarte (Leerstring möglich). */
  description?: string;
  /** Aus `generation_meta.time_budget_minutes` bei Erstellung; ältere Blätter ohne Eintrag: `null`. */
  planned_duration_minutes?: number | null;
  library_published_at:string|null;
  owner_label:string;
  viewer_is_owner:boolean;
};
export type Pattern={
  id:string;key:string;name:string;description:string;status:string;blueprint:any;preview_svg:string;
  /** Vom Backend: Standard-Bibliothek ohne Einzelkauf */
  is_system?:boolean;
};

/** Payload für POST /worksheets/generate/ — wird 1:1 an die KI übergeben */
export type GenerateWorksheetPayload={
  /** Standard: Lehrplan-/Vorlagen-Pipeline; Kreativ: freiere HTML/CSS-Gestaltung, kein Pattern-Match */
  worksheet_mode?:'standard'|'creative';
  topic:string;subject_name:string;grade_value:number|null;
  /** Optional, z. B. „8–10“ für die KI; `grade_value` bleibt ein repräsentativer Punkt für DB/Audience. */
  grade_band?:string|null;
  teacher_prompt:string;
  audience:string;difficulty:string;worksheet_type:string;tone:string;language:string;
  time_budget_minutes:number|null;differentiation:string;additional_constraints:string;
  creativity:string;theme:string;page_setup:PageSetup;
  pattern_id?:string;use_pattern_matching?:boolean;
  /** Optional: stehen im {{REQUEST_JSON}} des Prompts für die KI */
  learning_goal?:string;
  school_form?:string;
  federal_state?:string;
};
