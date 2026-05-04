import type { GenerateWorksheetPayload, PageSetup } from '../../types';

export type WizardOrientation = 'portrait' | 'landscape';
export type WizardColorMode = 'sw' | 'print' | 'dezent' | 'bunt';
export type WizardDecoLevel = 'keine' | 'leicht' | 'mittel' | 'kreativ';
export type WizardDesignStyle = 'klassisch' | 'modern' | 'grundschule' | 'akademisch' | 'kreativ';
export type WizardRenderer = 'auto' | 'html' | 'latex';

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
  /* Step 1 — Inhalt */
  topic: string;
  subject: string;
  grade: string;
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

  /* Step 2 — Vorlage */
  patternId: string | null;

  /* Step 3 — Design & Seite */
  orientation: WizardOrientation;
  margins: { top: number; right: number; bottom: number; left: number };
  marginLinked: boolean;
  marginValue: number;
  colorMode: WizardColorMode;
  decoLevel: WizardDecoLevel;
  designStyle: WizardDesignStyle;
  renderer: WizardRenderer;
};

export const INITIAL_WIZARD_STATE: WizardState = {
  topic: 'Lineare Gleichungen lösen',
  subject: 'Mathematik',
  grade: '9',
  schoolForm: 'Gymnasium',
  state: 'Bayern',
  worksheetType: 'practice',
  difficulty: 'standard',
  duration: '45',
  language: 'de',
  learningGoal:
    'Lineare Gleichungen mit einer Variable durch Äquivalenzumformung sicher lösen können.',
  teacherPrompt:
    'Fokus auf Aufgaben mit Parametern. Keine Multiple-Choice-Fragen. Lösungen kurz aber vollständig.',
  differentiation: '',
  additionalConstraints: '',
  patternId: null,
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
  marginLinked: true,
  marginValue: 12,
  colorMode: 'dezent',
  decoLevel: 'leicht',
  designStyle: 'modern',
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
  | { type: 'clearPattern' }
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

    case 'clearPattern':
      if (state.patternId == null) return state;
      return { ...state, patternId: null };

    case 'reset':
      return INITIAL_WIZARD_STATE;
  }
};

export const buildGeneratePayload = (state: WizardState): GenerateWorksheetPayload => {
  const grade = state.grade.trim() === '' ? null : Number(state.grade);
  const gradeValue = Number.isFinite(grade as number) ? (grade as number) : null;
  const time = state.duration.trim() === '' ? null : Number(state.duration);
  const learningGoal = state.learningGoal.trim();
  const schoolForm = state.schoolForm.trim();
  const federalState = state.state.trim();
  const audience = deriveAudienceFromSchoolContext(schoolForm, gradeValue);
  return {
    topic: state.topic,
    subject_name: state.subject,
    grade_value: gradeValue,
    teacher_prompt: state.teacherPrompt,
    audience,
    difficulty: state.difficulty,
    worksheet_type: state.worksheetType,
    tone: 'neutral',
    language: state.language,
    time_budget_minutes: Number.isFinite(time as number) ? (time as number) : null,
    differentiation: state.differentiation,
    additional_constraints: state.additionalConstraints,
    creativity:
      state.decoLevel === 'kreativ'
        ? 'balanced'
        : state.decoLevel === 'mittel'
          ? 'balanced'
          : 'minimal_professional',
    theme: 'minimal',
    page_setup: buildPageSetup(state),
    pattern_id: state.patternId || undefined,
    use_pattern_matching: !state.patternId,
    ...(learningGoal ? { learning_goal: learningGoal } : {}),
    ...(schoolForm ? { school_form: schoolForm } : {}),
    ...(federalState ? { federal_state: federalState } : {}),
  };
};
