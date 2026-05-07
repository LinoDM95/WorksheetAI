import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  BoardModelConfig,
  CreativeBrief,
  IntentAnalysis,
  RiskAnalysis,
  StyleDNA,
} from '../../types';
import { Badge, SectionCard } from '../../../../components/ui';
import { cn } from '../../../../lib/cn';

type Props = {
  intent?: IntentAnalysis;
  risk?: RiskAnalysis;
  brief?: CreativeBrief;
  dna?: StyleDNA;
  modelConfig?: BoardModelConfig;
  tokenUsage?: Record<string, number>;
  estimatedCost?: Record<string, number>;
  repairHistory?: { round: number; mode?: string; ok?: boolean; error_count?: number }[];
};

const isPresent = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[120px_1fr] gap-2 px-5 py-2 text-[13px]">
    <span className="text-slate-500">{label}</span>
    <span className="text-slate-800">{children}</span>
  </div>
);

const Section = ({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-[13px] font-semibold text-slate-800 hover:bg-slate-50"
      >
        <span>{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className={cn('pb-3')}>{children}</div>}
    </div>
  );
};

const PaletteSwatch = ({ color, label }: { color?: string; label: string }) => {
  if (!color) return null;
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-5 w-5 rounded border border-slate-200"
        style={{ background: color }}
        aria-hidden
      />
      <span className="text-[12px] text-slate-600">{label}</span>
      <code className="text-[11px] text-slate-500">{color}</code>
    </div>
  );
};

const RISK_TONE: Record<string, 'success' | 'warn' | 'primary'> = {
  low: 'success',
  medium: 'warn',
  high: 'primary',
};

export function BoardPipelineDetailsPanel({
  intent,
  risk,
  brief,
  dna,
  modelConfig,
  tokenUsage,
  estimatedCost,
  repairHistory,
}: Props) {
  const hasAny =
    isPresent(intent) ||
    isPresent(risk) ||
    isPresent(brief) ||
    isPresent(dna) ||
    isPresent(modelConfig) ||
    isPresent(repairHistory);
  if (!hasAny) {
    return null;
  }

  return (
    <SectionCard
      title="Pipeline-Details"
      description="Intent, Risiken, Creative Brief, Style DNA und Repair-Historie."
    >
      {isPresent(intent) && (
        <Section title="Intent-Analyse">
          {intent?.subject_area && <Row label="Fach">{intent.subject_area}</Row>}
          {intent?.grade_band && <Row label="Klasse">{intent.grade_band}</Row>}
          {intent?.board_kind && <Row label="Board-Typ">{intent.board_kind}</Row>}
          {intent?.recommended_complexity && (
            <Row label="Komplexität">
              <Badge tone="neutral">{intent.recommended_complexity}</Badge>
            </Row>
          )}
          {intent?.recommended_visual_direction && (
            <Row label="Visuelle Richtung">{intent.recommended_visual_direction}</Row>
          )}
          {intent?.interaction_needs && intent.interaction_needs.length > 0 && (
            <Row label="Interaktionen">
              <div className="flex flex-wrap gap-1">
                {intent.interaction_needs.map((s) => (
                  <Badge key={s} tone="neutral">{s}</Badge>
                ))}
              </div>
            </Row>
          )}
          {intent?.teacher_prompt_summary && (
            <Row label="Zusammenfassung">{intent.teacher_prompt_summary}</Row>
          )}
        </Section>
      )}

      {isPresent(risk) && (
        <Section title="Risiko-Analyse">
          {risk?.overall_risk && (
            <Row label="Gesamtrisiko">
              <Badge tone={RISK_TONE[risk.overall_risk] ?? 'neutral'}>{risk.overall_risk}</Badge>
            </Row>
          )}
          {risk?.complexity && <Row label="Komplexität">{risk.complexity}</Row>}
          {risk?.recommended_generation_strategy && (
            <Row label="Strategie">{risk.recommended_generation_strategy}</Row>
          )}
          {risk?.teacher_warning && <Row label="Warnung">{risk.teacher_warning}</Row>}
          {risk?.risks && risk.risks.length > 0 && (
            <div className="px-5 pt-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Einzelrisiken</p>
              <ul className="mt-1 space-y-1.5">
                {risk.risks.map((r, idx) => (
                  <li key={idx} className="rounded-md bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700">
                    <div className="flex items-center gap-2">
                      <Badge tone={RISK_TONE[r.level] ?? 'neutral'}>{r.level}</Badge>
                      <span className="font-semibold">{r.type}</span>
                    </div>
                    {r.reason && <p className="mt-0.5 text-slate-600">{r.reason}</p>}
                    {r.mitigation && (
                      <p className="mt-0.5 text-slate-500">
                        <span className="font-semibold">Maßnahme:</span> {r.mitigation}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      {isPresent(brief) && (
        <Section title="Creative Brief">
          {brief?.board_goal && <Row label="Ziel">{brief.board_goal}</Row>}
          {brief?.audience && <Row label="Zielgruppe">{brief.audience}</Row>}
          {brief?.learning_goal && <Row label="Lernziel">{brief.learning_goal}</Row>}
          {brief?.must_have && brief.must_have.length > 0 && (
            <Row label="Muss enthalten">{brief.must_have.join(' · ')}</Row>
          )}
          {brief?.must_avoid && brief.must_avoid.length > 0 && (
            <Row label="Vermeiden">{brief.must_avoid.join(' · ')}</Row>
          )}
          {brief?.didactic_flow && brief.didactic_flow.length > 0 && (
            <div className="px-5 pt-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Didaktischer Fluss</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12.5px] text-slate-700">
                {brief.didactic_flow.map((step, i) => (
                  <li key={i}>
                    <span className="font-semibold">{step.phase}:</span> {step.goal}
                    {step.interaction ? ` (${step.interaction})` : ''}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Section>
      )}

      {isPresent(dna) && (
        <Section title="Style DNA">
          {dna?.visual_metaphor && <Row label="Metapher">{dna.visual_metaphor}</Row>}
          {dna?.mood && <Row label="Mood">{dna.mood}</Row>}
          {dna?.layout_principle && <Row label="Layout">{dna.layout_principle}</Row>}
          {dna?.density && <Row label="Dichte">{dna.density}</Row>}
          {dna?.palette && (
            <div className="px-5 pt-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Palette</p>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <PaletteSwatch color={dna.palette.background} label="Background" />
                <PaletteSwatch color={dna.palette.surface} label="Surface" />
                <PaletteSwatch color={dna.palette.primary} label="Primary" />
                <PaletteSwatch color={dna.palette.secondary} label="Secondary" />
                <PaletteSwatch color={dna.palette.accent} label="Accent" />
                <PaletteSwatch color={dna.palette.text} label="Text" />
              </div>
            </div>
          )}
        </Section>
      )}

      {isPresent(repairHistory) && (
        <Section title={`Repair-Historie (${repairHistory?.length ?? 0})`}>
          <ul className="px-5 space-y-1 text-[12.5px] text-slate-700">
            {repairHistory?.map((r) => (
              <li key={r.round} className="flex items-center gap-2">
                <span className="text-slate-500">#{r.round}</span>
                {r.mode && <Badge tone="neutral">{r.mode}</Badge>}
                <Badge tone={r.ok ? 'success' : 'warn'}>{r.ok ? 'ok' : 'teilweise'}</Badge>
                {typeof r.error_count === 'number' && (
                  <span className="text-slate-500">{r.error_count} Fehler</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(isPresent(modelConfig) || isPresent(tokenUsage) || isPresent(estimatedCost)) && (
        <Section title="Modelle & Kosten">
          {modelConfig?.small_model && <Row label="Small-Model">{modelConfig.small_model}</Row>}
          {modelConfig?.large_model && <Row label="Large-Model">{modelConfig.large_model}</Row>}
          {modelConfig?.quality_mode && <Row label="Quality-Mode">{modelConfig.quality_mode}</Row>}
          {tokenUsage && Object.keys(tokenUsage).length > 0 && (
            <Row label="Token-Verbrauch">
              <code className="text-[12px] text-slate-700">
                {Object.entries(tokenUsage)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' · ')}
              </code>
            </Row>
          )}
          {estimatedCost && Object.keys(estimatedCost).length > 0 && (
            <Row label="Geschätzte Kosten">
              <code className="text-[12px] text-slate-700">
                {Object.entries(estimatedCost)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' · ')}
              </code>
            </Row>
          )}
        </Section>
      )}
    </SectionCard>
  );
}
