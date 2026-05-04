export type PageSetup={format:'A4';orientation:'portrait'|'landscape';unit:'mm';width_mm:number;height_mm:number;margins_mm:{top:number;right:number;bottom:number;left:number};safe_area:{x_mm:number;y_mm:number;width_mm:number;height_mm:number};renderer:'html'};
export type Worksheet={id:string;title:string;subject:string;grade:number|null;topic:string;page_setup:PageSetup;content:any;render_model:any;pattern_name?:string;status?:string;updated_at?:string};
export type Pattern={id:string;key:string;name:string;description:string;status:string;blueprint:any;preview_svg:string};

/** Payload für POST /worksheets/generate/ — wird 1:1 an die KI übergeben */
export type GenerateWorksheetPayload={
  topic:string;subject_name:string;grade_value:number|null;
  teacher_prompt:string;
  audience:string;difficulty:string;worksheet_type:string;tone:string;language:string;
  time_budget_minutes:number|null;differentiation:string;additional_constraints:string;
  creativity:string;theme:string;page_setup:PageSetup;
  pattern_id?:string;use_pattern_matching?:boolean;
};
