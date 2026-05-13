import { describe, expect, it } from 'vitest';
import {
  INITIAL_WIZARD_STATE,
  audienceDisplayLabel,
  buildGeneratePayload,
  buildPageSetup,
  deriveAudienceFromSchoolContext,
  validateWizardInhaltStep,
  wizardReducer,
  type WizardState,
} from './wizardState';

describe('deriveAudienceFromSchoolContext', () => {
  it('Hochschule -> university', () => {
    expect(deriveAudienceFromSchoolContext('Hochschule', null)).toBe('university');
  });

  it('Berufsschule -> vocational', () => {
    expect(deriveAudienceFromSchoolContext('Berufliche Schule', 11)).toBe('vocational');
  });

  it('Grundschule -> primary', () => {
    expect(deriveAudienceFromSchoolContext('Grundschule', null)).toBe('primary');
  });

  it('Klasse 1–4 -> primary', () => {
    expect(deriveAudienceFromSchoolContext('', 1)).toBe('primary');
    expect(deriveAudienceFromSchoolContext('', 4)).toBe('primary');
  });

  it('Klasse 11–13 -> upper_secondary', () => {
    expect(deriveAudienceFromSchoolContext('', 11)).toBe('upper_secondary');
    expect(deriveAudienceFromSchoolContext('', 13)).toBe('upper_secondary');
  });

  it('Klasse 5–10 -> lower_secondary', () => {
    expect(deriveAudienceFromSchoolContext('', 5)).toBe('lower_secondary');
    expect(deriveAudienceFromSchoolContext('', 10)).toBe('lower_secondary');
  });

  it('Gymnasium ohne Klasse -> lower_secondary', () => {
    expect(deriveAudienceFromSchoolContext('Gymnasium', null)).toBe('lower_secondary');
  });

  it('Default ohne Hinweise -> lower_secondary', () => {
    expect(deriveAudienceFromSchoolContext('', null)).toBe('lower_secondary');
  });
});

describe('audienceDisplayLabel', () => {
  it('mappt alle Audiences auf deutsche Labels', () => {
    expect(audienceDisplayLabel('primary')).toBe('Grundschule');
    expect(audienceDisplayLabel('lower_secondary')).toBe('Sek I / Mittelstufe');
    expect(audienceDisplayLabel('upper_secondary')).toBe('Sek II / Oberstufe');
    expect(audienceDisplayLabel('vocational')).toBe('Berufliche Schule');
    expect(audienceDisplayLabel('university')).toBe('Hochschule');
  });
});

describe('buildPageSetup', () => {
  it('Portrait: 210×297', () => {
    const setup = buildPageSetup({ ...INITIAL_WIZARD_STATE, orientation: 'portrait' });
    expect(setup.width_mm).toBe(210);
    expect(setup.height_mm).toBe(297);
    expect(setup.orientation).toBe('portrait');
    expect(setup.renderer).toBe('html');
  });

  it('Initial-State: Standard nutzt Renderer latex nur im Wizard (Seiten-Setup bleibt Web/html)', () => {
    expect(INITIAL_WIZARD_STATE.renderer).toBe('latex');
    expect(INITIAL_WIZARD_STATE.worksheetMode).toBe('standard');
  });

  it('Landscape: 297×210', () => {
    const setup = buildPageSetup({ ...INITIAL_WIZARD_STATE, orientation: 'landscape' });
    expect(setup.width_mm).toBe(297);
    expect(setup.height_mm).toBe(210);
  });

  it('safe_area zieht Margins ab', () => {
    const state: WizardState = {
      ...INITIAL_WIZARD_STATE,
      orientation: 'portrait',
      margins: { top: 10, right: 15, bottom: 20, left: 25 },
    };
    const setup = buildPageSetup(state);
    expect(setup.safe_area.x_mm).toBe(25);
    expect(setup.safe_area.y_mm).toBe(10);
    expect(setup.safe_area.width_mm).toBe(210 - 25 - 15);
    expect(setup.safe_area.height_mm).toBe(297 - 10 - 20);
  });
});

describe('wizardReducer', () => {
  it('set ändert keys', () => {
    const s = wizardReducer(INITIAL_WIZARD_STATE, { type: 'set', key: 'topic', value: 'Brüche' });
    expect(s.topic).toBe('Brüche');
  });

  it('set ohne Änderung gibt dieselbe State-Referenz zurück (Stabilität)', () => {
    const s = wizardReducer(INITIAL_WIZARD_STATE, {
      type: 'set',
      key: 'topic',
      value: INITIAL_WIZARD_STATE.topic,
    });
    expect(s).toBe(INITIAL_WIZARD_STATE);
  });

  it('patch mergt Felder', () => {
    const s = wizardReducer(INITIAL_WIZARD_STATE, {
      type: 'patch',
      patch: { topic: 'X', subject: 'Y' },
    });
    expect(s.topic).toBe('X');
    expect(s.subject).toBe('Y');
  });

  it('setMargin: ändert nur eine Seite, nicht im linked-Modus', () => {
    const linked = wizardReducer(INITIAL_WIZARD_STATE, { type: 'setMargin', side: 'top', value: 50 });
    expect(linked.margins.top).toBe(INITIAL_WIZARD_STATE.margins.top);

    const unlinked: WizardState = { ...INITIAL_WIZARD_STATE, marginLinked: false };
    const out = wizardReducer(unlinked, { type: 'setMargin', side: 'top', value: 30 });
    expect(out.margins.top).toBe(30);
    expect(out.margins.right).toBe(INITIAL_WIZARD_STATE.margins.right);
  });

  it('setMarginValue: synchronisiert alle Seiten im linked-Modus', () => {
    const out = wizardReducer(INITIAL_WIZARD_STATE, { type: 'setMarginValue', value: 30 });
    expect(out.margins).toEqual({ top: 30, right: 30, bottom: 30, left: 30 });
    expect(out.marginValue).toBe(30);
  });

  it('setMarginValue: ändert keine Margins im unlinked-Modus', () => {
    const unlinked: WizardState = {
      ...INITIAL_WIZARD_STATE,
      marginLinked: false,
      margins: { top: 5, right: 6, bottom: 7, left: 8 },
    };
    const out = wizardReducer(unlinked, { type: 'setMarginValue', value: 30 });
    expect(out.margins).toEqual({ top: 5, right: 6, bottom: 7, left: 8 });
    expect(out.marginValue).toBe(30);
  });

  it('toggleMarginLink: aus aus -> an synchronisiert auf marginValue', () => {
    const unlinked: WizardState = {
      ...INITIAL_WIZARD_STATE,
      marginLinked: false,
      marginValue: 25,
      margins: { top: 1, right: 2, bottom: 3, left: 4 },
    };
    const out = wizardReducer(unlinked, { type: 'toggleMarginLink' });
    expect(out.marginLinked).toBe(true);
    expect(out.margins).toEqual({ top: 25, right: 25, bottom: 25, left: 25 });
  });

  it('toggleMarginLink: an -> aus toggelt nur das Flag', () => {
    const out = wizardReducer(INITIAL_WIZARD_STATE, { type: 'toggleMarginLink' });
    expect(out.marginLinked).toBe(false);
  });

  it('reset stellt Initial-State wieder her', () => {
    const dirty: WizardState = { ...INITIAL_WIZARD_STATE, topic: 'X' };
    const out = wizardReducer(dirty, { type: 'reset' });
    expect(out).toBe(INITIAL_WIZARD_STATE);
  });
});

describe('validateWizardInhaltStep', () => {
  const withTitle = { ...INITIAL_WIZARD_STATE, worksheetTitle: 'Arbeitsblatt 1' };

  it('rejects ohne Arbeitsblatt-Titel', () => {
    expect(validateWizardInhaltStep({ ...INITIAL_WIZARD_STATE })).toMatch(/Arbeitsblatt-Titel|Titel angeben|Titel/i);
  });

  it('rejects ohne topic', () => {
    expect(validateWizardInhaltStep(withTitle)).toMatch(/Thema/);
  });

  it('rejects ohne subject', () => {
    expect(validateWizardInhaltStep({ ...withTitle, topic: 'X' })).toMatch(/Fach/);
  });

  it('rejects ohne Klassenstufe', () => {
    expect(
      validateWizardInhaltStep({
        ...withTitle,
        topic: 'X',
        subject: 'Mathe',
      }),
    ).toMatch(/Klassenstufe/);
  });

  it('rejects ohne Dauer', () => {
    expect(
      validateWizardInhaltStep({
        ...withTitle,
        topic: 'X',
        subject: 'Mathe',
        gradeFrom: '5',
        gradeTo: '5',
      }),
    ).toMatch(/Dauer/);
  });

  it('rejects bei Dauer außerhalb 5–90 oder nicht ganzzahlig', () => {
    expect(
      validateWizardInhaltStep({
        ...withTitle,
        topic: 'X',
        subject: 'Mathe',
        gradeFrom: '5',
        gradeTo: '5',
        duration: '4',
        teacherPrompt: 'x',
      }),
    ).toMatch(/5 und 90/);
    expect(
      validateWizardInhaltStep({
        ...withTitle,
        topic: 'X',
        subject: 'Mathe',
        gradeFrom: '5',
        gradeTo: '5',
        duration: '91',
        teacherPrompt: 'x',
      }),
    ).toMatch(/5 und 90/);
    expect(
      validateWizardInhaltStep({
        ...withTitle,
        topic: 'X',
        subject: 'Mathe',
        gradeFrom: '5',
        gradeTo: '5',
        duration: '30.5',
        teacherPrompt: 'x',
      }),
    ).toMatch(/5 und 90/);
  });

  it('rejects ohne teacherPrompt', () => {
    expect(
      validateWizardInhaltStep({
        ...withTitle,
        topic: 'X',
        subject: 'Mathe',
        gradeFrom: '5',
        gradeTo: '5',
        duration: '45',
      }),
    ).toMatch(/Lehrer/);
  });

  it('liefert null wenn alles ok', () => {
    expect(
      validateWizardInhaltStep({
        ...withTitle,
        topic: 'X',
        subject: 'Mathe',
        gradeFrom: '5',
        gradeTo: '5',
        duration: '45',
        teacherPrompt: 'Mach das gut.',
      }),
    ).toBeNull();
  });
});

describe('buildGeneratePayload', () => {
  const ready: WizardState = {
    ...INITIAL_WIZARD_STATE,
    worksheetTitle: 'Klassenarbeit Brüche',
    topic: 'Brüche',
    subject: 'Mathe',
    gradeFrom: '5',
    gradeTo: '7',
    teacherPrompt: 'Üben',
    schoolForm: 'Gymnasium',
    state: 'Bayern',
    learningGoal: 'Bruchrechnen verstehen',
    duration: '45',
    difficulty: 'medium',
    worksheetType: 'practice',
    language: 'de',
  };

  it('berechnet gradeValue als Mittel von 5..7 -> 6', () => {
    const p = buildGeneratePayload(ready);
    expect(p.grade_value).toBe(6);
    expect(p.grade_band).toBe('5–7');
    expect((p as { worksheet_title?: string }).worksheet_title).toBe('Klassenarbeit Brüche');
  });

  it('ohne worksheetTitle kein Feld worksheet_title', () => {
    const p = buildGeneratePayload({ ...ready, worksheetTitle: '' });
    expect((p as { worksheet_title?: string }).worksheet_title).toBeUndefined();
  });

  it('grade_band wird bei gradeFrom===gradeTo zur Einzelzahl', () => {
    const p = buildGeneratePayload({ ...ready, gradeFrom: '5', gradeTo: '5' });
    expect(p.grade_band).toBe('5');
  });

  it('audience aus Schulform ableitet', () => {
    const p = buildGeneratePayload({ ...ready, schoolForm: 'Grundschule', gradeFrom: '3', gradeTo: '3' });
    expect(p.audience).toBe('primary');
  });

  it('time_budget_minutes ist null bei leerer duration', () => {
    const p = buildGeneratePayload({ ...ready, duration: '' });
    expect(p.time_budget_minutes).toBeNull();
  });

  it('time_budget_minutes ist null bei nicht-numeric', () => {
    const p = buildGeneratePayload({ ...ready, duration: 'abc' });
    expect(p.time_budget_minutes).toBeNull();
  });

  it('time_budget_minutes parsed numeric', () => {
    const p = buildGeneratePayload({ ...ready, duration: '30' });
    expect(p.time_budget_minutes).toBe(30);
  });

  it('worksheet_mode standard nutzt use_pattern_matching=true', () => {
    const p = buildGeneratePayload({ ...ready, worksheetMode: 'standard' });
    expect(p.worksheet_mode).toBe('standard');
    expect(p.use_pattern_matching).toBe(true);
  });

  it('worksheet_mode creative deaktiviert pattern matching', () => {
    const p = buildGeneratePayload({ ...ready, worksheetMode: 'creative', creativeShowSheetHeader: true });
    expect(p.worksheet_mode).toBe('creative');
    expect(p.use_pattern_matching).toBe(false);
    expect(p.creative_show_sheet_header).toBe(true);
  });

  it('learning_goal nur wenn gefüllt', () => {
    const p = buildGeneratePayload({ ...ready, learningGoal: '' });
    expect((p as { learning_goal?: string }).learning_goal).toBeUndefined();
  });

  it('grade_value=null bei nicht-numerischer Klassenstufe', () => {
    const p = buildGeneratePayload({ ...ready, gradeFrom: 'abc', gradeTo: 'def' });
    expect(p.grade_value).toBeNull();
    expect(p.grade_band).toBeUndefined();
  });

  it('Standard-Defaults werden gesetzt (difficulty/worksheetType/language)', () => {
    const p = buildGeneratePayload({
      ...ready,
      difficulty: '',
      worksheetType: '',
      language: '',
    });
    expect(p.difficulty).toBe('standard');
    expect(p.worksheet_type).toBe('practice');
    expect(p.language).toBe('de');
  });
});
