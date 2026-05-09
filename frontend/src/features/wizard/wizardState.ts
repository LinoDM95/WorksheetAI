import type { GenerateWorksheetPayload, PageSetup } from '../../types';

export type WizardOrientation = 'portrait' | 'landscape';
export type WizardRenderer = 'auto' | 'html' | 'latex';

export type WorksheetWizardMode = 'standard' | 'creative';

/** API-Werte für `audience` — werden aus Schulform + Klassenstufe abgeleitet, nicht mehr manuell gewählt. */
export type AudienceId = 'primary' | 'lower_secondary' | 'upper_secondary' | 'vocational' | 'university';

export const deriveAudienceFromSchoolContext = (
  schoolForm: string,
  gradeValue: number | null,
): AudienceId => {
  const sf = schoolForm.trim().toLowerCase();
  const g = gradeValue;

  if (sf.includes('hochschule')) return 'university';
  if (sf.includes('beruf')) return 'vocational';
  if (sf.includes('grundschule')) return 'primary';

  if (g != null && Number.isFinite(g)) {
    if (g <= 4) return 'primary';
    if (g >= 11) return 'upper_secondary';
    return 'lower_secondary';
  }

  if (sf.includes('gymnasium') || sf.includes('realschule') || sf.includes('gesamt')) {
    return 'lower_secondary';
  }

  return 'lower_secondary';
};

export const audienceDisplayLabel = (id: AudienceId): string => {
  const labels: Record<AudienceId, string> = {
    primary: 'Grundschule',
    lower_secondary: 'Sek I / Mittelstufe',
    upper_secondary: 'Sek II / Oberstufe',
    vocational: 'Berufliche Schule',
    university: 'Hochschule',
  };
  return labels[id];
};

export type WizardState = {
  /* Step 1 — Modus */
  worksheetMode: WorksheetWizardMode;
  /** Nur Kreativ: fester Kopfbereich (Titel/Untertitel) oberhalb des KI‑HTML — Standard eingeschaltet. */
  creativeShowSheetHeader: boolean;

  /* Step 2 — Inhalt */
  topic: string;
  subject: string;
  gradeFrom: string;
  gradeTo: string;
  schoolForm: string;
  state: string;
  worksheetType: string;
  difficulty: string;
  duration: string;
  language: string;
  learningGoal: string;
  teacherPrompt: string;
  differentiation: string;
  additionalConstraints: string;

  /* Step 3 — Design & Seite */
  orientation: WizardOrientation;
  margins: { top: number; right: number; bottom: number; left: number };
  marginLinked: boolean;
  marginValue: number;
  /** Nur Standardmodus — Steuerung der späteren Darstellung; Kreativ immer HTML. */
  renderer: WizardRenderer;
};

export const INITIAL_WIZARD_STATE: WizardState = {
  worksheetMode: 'standard',
  creativeShowSheetHeader: true,
  topic: '',
  subject: '',
  gradeFrom: '',
  gradeTo: '',
  schoolForm: '',
  state: '',
  worksheetType: '',
  difficulty: '',
  duration: '',
  language: '',
  learningGoal: '',
  teacherPrompt: '',
  differentiation: '',
  additionalConstraints: '',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
  marginLinked: true,
  marginValue: 12,
  renderer: 'auto',
};

export const buildPageSetup = (state: WizardState): PageSetup => {
  const w = state.orientation === 'portrait' ? 210 : 297;
  const h = state.orientation === 'portrait' ? 297 : 210;
  return {
    format: 'A4',
    orientation: state.orientation,
    unit: 'mm',
    width_mm: w,
    height_mm: h,
    margins_mm: state.margins,
    safe_area: {
      x_mm: state.margins.left,
      y_mm: state.margins.top,
      width_mm: w - state.margins.left - state.margins.right,
      height_mm: h - state.margins.top - state.margins.bottom,
    },
    renderer: 'html',
  };
};

export type MarginSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * Reducer-Aktionen für den Wizard-State.
 *
 * Die linked-margin-Synchronisation lebt im Reducer (vorher als useEffect-Side-Effect
 * in `WizardPage`). Damit gibt es genau einen Pfad für State-Änderungen.
 */
export type WizardAction =
  | {
      [K in keyof WizardState]: { type: 'set'; key: K; value: WizardState[K] };
    }[keyof WizardState]
  | { type: 'patch'; patch: Partial<WizardState> }
  | { type: 'setMargin'; side: MarginSide; value: number }
  | { type: 'setMarginValue'; value: number }
  | { type: 'toggleMarginLink' }
  | { type: 'reset' };

const equalMargins = (m: WizardState['margins'], v: number) =>
  m.top === v && m.right === v && m.bottom === v && m.left === v;

export const wizardReducer = (state: WizardState, action: WizardAction): WizardState => {
  switch (action.type) {
    case 'set':
      if (state[action.key] === action.value) return state;
      return { ...state, [action.key]: action.value };

    case 'patch':
      return { ...state, ...action.patch };

    case 'setMargin':
      if (state.marginLinked) return state;
      if (state.margins[action.side] === action.value) return state;
      return { ...state, margins: { ...state.margins, [action.side]: action.value } };

    case 'setMarginValue': {
      const next: WizardState = { ...state, marginValue: action.value };
      if (state.marginLinked && !equalMargins(state.margins, action.value)) {
        next.margins = {
          top: action.value,
          right: action.value,
          bottom: action.value,
          left: action.value,
        };
      }
      return next;
    }

    case 'toggleMarginLink': {
      const linked = !state.marginLinked;
      if (linked && !equalMargins(state.margins, state.marginValue)) {
        return {
          ...state,
          marginLinked: true,
          margins: {
            top: state.marginValue,
            right: state.marginValue,
            bottom: state.marginValue,
            left: state.marginValue,
          },
        };
      }
      return { ...state, marginLinked: linked };
    }

    case 'reset':
      return INITIAL_WIZARD_STATE;
  }
};

const resolveGradeFromWizard = (
  gradeFrom: string,
  gradeTo: string,
): { gradeValue: number | null; gradeBand: string | null } => {
  const a = gradeFrom.trim();
  const b = gradeTo.trim();
  if (!a || !b) return { gradeValue: null, gradeBand: null };
  const nFrom = Number(a);
  const nTo = Number(b);
  if (!Number.isFinite(nFrom) || !Number.isFinite(nTo)) return { gradeValue: null, gradeBand: null };
  const lo = Math.min(nFrom, nTo);
  const hi = Math.max(nFrom, nTo);
  const gradeValue = Math.round((lo + hi) / 2);
  const gradeBand = lo === hi ? `${lo}` : `${lo}–${hi}`;
  return { gradeValue, gradeBand };
};

export const validateWizardInhaltStep = (state: WizardState): string | null => {
  if (!state.topic.trim()) return 'Bitte ein Thema angeben.';
  if (!state.subject.trim()) return 'Bitte ein Fach wählen.';
  if (!state.gradeFrom.trim() || !state.gradeTo.trim()) {
    return 'Bitte Klassenstufe von und bis wählen.';
  }
  if (!state.teacherPrompt.trim()) return 'Bitte den Lehrer-Prompt / Zusatzwünsche ausfüllen.';
  return null;
};

export const buildGeneratePayload = (state: WizardState): GenerateWorksheetPayload => {
  const { gradeValue, gradeBand } = resolveGradeFromWizard(state.gradeFrom, state.gradeTo);
  const timeRaw = state.duration.trim();
  const timeParsed = timeRaw === '' ? NaN : Number(timeRaw);
  const time_budget_minutes = Number.isFinite(timeParsed) ? timeParsed : null;
  const learningGoal = state.learningGoal.trim();
  const schoolForm = state.schoolForm.trim();
  const federalState = state.state.trim();
  const audience = deriveAudienceFromSchoolContext(schoolForm, gradeValue);
  const mode = state.worksheetMode === 'creative' ? 'creative' : 'standard';
  const difficulty = state.difficulty.trim() || 'standard';
  const worksheetType = state.worksheetType.trim() || 'practice';
  const language = state.language.trim() || 'de';
  const payload: GenerateWorksheetPayload = {
    worksheet_mode: mode,
    topic: state.topic,
    subject_name: state.subject,
    grade_value: gradeValue,
    ...(gradeBand ? { grade_band: gradeBand } : {}),
    teacher_prompt: state.teacherPrompt,
    audience,
    difficulty,
    worksheet_type: worksheetType,
    tone: 'neutral',
    language,
    time_budget_minutes,
    differentiation: state.differentiation,
    additional_constraints: state.additionalConstraints,
    creativity: 'balanced',
    theme: 'minimal',
    page_setup: buildPageSetup(state),
    use_pattern_matching: mode === 'standard',
    ...(learningGoal ? { learning_goal: learningGoal } : {}),
    ...(schoolForm ? { school_form: schoolForm } : {}),
    ...(federalState ? { federal_state: federalState } : {}),
    ...(mode === 'creative' ? { creative_show_sheet_header: state.creativeShowSheetHeader } : {}),
  };
  return payload;
};
