import type { RevisionMode } from '../../types';
import { Button } from '../../../../components/ui';

type QuickAction = {
  id: string;
  label: string;
  mode: RevisionMode;
  /** Vorausgefüllter Lehrer-Prompt für diesen Modus. */
  prompt: string;
};

export const REVISION_QUICK_ACTIONS: QuickAction[] = [
  { id: 'fix', label: 'Fehler beheben', mode: 'bug_fix', prompt: 'Behebe Fehler im Code, ohne das Design zu verändern.' },
  { id: 'pretty', label: 'Mach es schöner', mode: 'design_improve', prompt: 'Verbessere visuelles Design, Layout und Hierarchie.' },
  { id: 'touch', label: 'Touchfreundlicher', mode: 'touch_optimize', prompt: 'Optimiere Touch-Bedienung, größere Flächen, Pointer-Events.' },
  { id: 'short', label: 'Texte kürzen', mode: 'simplify', prompt: 'Kürze Texte und reduziere Optionen für klarere Bedienung.' },
  { id: 'more_anim', label: 'Mehr Animation', mode: 'make_more_creative', prompt: 'Füge sinnvolle, dezente Animationen hinzu (max. 250ms).' },
  { id: 'less_anim', label: 'Weniger Animation', mode: 'performance_improve', prompt: 'Reduziere Animationen und schwere Effekte.' },
  { id: 'primary', label: 'Für Grundschule', mode: 'simplify', prompt: 'Vereinfache Sprache und Bedienung für die Grundschule.' },
  { id: 'pro', label: 'Professioneller', mode: 'design_improve', prompt: 'Mache das Design klarer, ruhiger und professioneller.' },
];

type Props = {
  onPick: (action: QuickAction) => void;
  disabled?: boolean;
};

export function RevisionQuickActions({ onPick, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {REVISION_QUICK_ACTIONS.map((a) => (
        <Button
          key={a.id}
          size="sm"
          variant="secondary"
          onClick={() => onPick(a)}
          disabled={disabled}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}
