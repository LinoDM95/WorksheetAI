import { useMemo, useReducer } from 'react';
import {
  INITIAL_WIZARD_STATE,
  wizardReducer,
  type MarginSide,
  type WizardAction,
  type WizardState,
} from './wizardState';

/**
 * `useWizardState` — kapselt den Wizard-Reducer hinter benannten Aktionen.
 *
 * Pattern: Steps bekommen `state` (read-only) + `actions` (Mutatoren) als Props.
 * Vorteil ggü. der alten `setState((s) => …)`-Inline-Logik:
 *  - Linked-Margin-Synchronisation passiert im Reducer (vorher als useEffect),
 *    daher kein Render-zyklus-Side-Effect mehr und keine Endlosschleifen-Risiken.
 *  - Mutationen sind benannt und einzeln testbar (`reducer + action` ohne React).
 *  - Steps müssen kein generisches `setState` kennen — engere API, weniger Bugs.
 */
export const useWizardState = (initial: WizardState = INITIAL_WIZARD_STATE) => {
  const [state, dispatch] = useReducer(wizardReducer, initial);

  const actions = useMemo(
    () => ({
      dispatch,
      setField: <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
        dispatch({ type: 'set', key, value } as WizardAction),
      patch: (partial: Partial<WizardState>) => dispatch({ type: 'patch', patch: partial }),
      setMargin: (side: MarginSide, value: number) =>
        dispatch({ type: 'setMargin', side, value }),
      setMarginValue: (value: number) => dispatch({ type: 'setMarginValue', value }),
      toggleMarginLink: () => dispatch({ type: 'toggleMarginLink' }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [],
  );

  return { state, actions };
};

export type WizardActions = ReturnType<typeof useWizardState>['actions'];
