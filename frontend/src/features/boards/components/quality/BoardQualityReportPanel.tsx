import type {
  AssetEnginePackSummary,
  QualityReport,
  QualitySection,
  QualitySectionStatus,
} from '../../types';
import { Badge } from '../../../../components/ui/Badge';
import { SectionCard } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../lib/cn';

const STATUS_LABEL: Record<QualitySectionStatus, string> = {
  passed: 'OK',
  warning: 'Warnung',
  failed: 'Fehler',
};

const STATUS_TONE: Record<QualitySectionStatus, 'success' | 'warn' | 'primary'> = {
  passed: 'success',
  warning: 'warn',
  failed: 'primary',
};

const SECTION_LABELS: Record<keyof QualityReport['sections'], string> = {
  security: 'Sicherheit',
  browser: 'Browser-Test',
  touch: 'Touch',
  design: 'Design',
  content: 'Inhalt',
  performance: 'Performance',
};

type Props = {
  report?: QualityReport;
  isChecking?: boolean;
  isRepairing?: boolean;
  onRunCheck?: () => void;
  onAutoRepair?: () => void;
  assetsSummary?: AssetEnginePackSummary;
  /** Automatisch reparieren (KI) nur am Board-Kopf */
  disableAutoRepair?: boolean;
  autoRepairDisabledTitle?: string;
};

const AssetEngineSection = ({ summary }: { summary?: AssetEnginePackSummary }) => {
  if (!summary || !summary.assets || summary.assets.length === 0) return null;
  const assetCount = summary.assets.length;
  const consistency = typeof summary.consistency_score === 'number' ? Math.round(summary.consistency_score) : null;
  const tone: 'success' | 'warn' | 'primary' =
    consistency == null ? 'primary' : consistency >= 75 ? 'success' : consistency >= 50 ? 'warn' : 'primary';
  return (
    <div className="border-t border-slate-200 px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Asset Engine</p>
        <div className="flex items-center gap-1.5">
          <Badge tone="neutral">{assetCount} Asset{assetCount === 1 ? '' : 's'}</Badge>
          {consistency != null && <Badge tone={tone}>Konsistenz {consistency}/100</Badge>}
          {summary.style_family && <Badge tone="neutral">{summary.style_family}</Badge>}
        </div>
      </div>
      {summary.warnings && summary.warnings.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] text-amber-700">
          {summary.warnings.slice(0, 3).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

const sectionKeys = (Object.keys(SECTION_LABELS) as (keyof QualityReport['sections'])[]);

const SectionRow = ({ label, section }: { label: string; section?: QualitySection }) => {
  if (!section) return null;
  const status = (section.status || 'warning') as QualitySectionStatus;
  return (
    <li className="flex items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-800">{label}</span>
          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          <span className="text-[12px] text-slate-500">{section.score}/100</span>
        </div>
        {section.issues && section.issues.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] text-slate-600">
            {section.issues.slice(0, 3).map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
};

export function BoardQualityReportPanel({
  report,
  isChecking,
  isRepairing,
  onRunCheck,
  onAutoRepair,
  assetsSummary,
  disableAutoRepair,
  autoRepairDisabledTitle,
}: Props) {
  if (!report || Object.keys(report).length === 0) {
    return (
      <SectionCard
        title="Qualitätscheck"
        description="Pipeline-Audits werden nach der Generierung automatisch ausgeführt."
        actions={
          <Button size="sm" variant="secondary" onClick={onRunCheck} disabled={isChecking}>
            {isChecking ? 'Prüfe…' : 'Erneut prüfen'}
          </Button>
        }
      >
        <p className="px-5 py-6 text-[13px] text-slate-500">
          Noch kein Quality Report vorhanden. Klicke auf <strong>Erneut prüfen</strong>, um die Audits jetzt
          auszuführen.
        </p>
        <AssetEngineSection summary={assetsSummary} />
      </SectionCard>
    );
  }

  const overall = (report.overall_status || 'warning') as QualitySectionStatus;
  const score = report.overall_score ?? 0;
  return (
    <SectionCard
      title="Qualitätscheck"
      description={report.teacher_facing_summary || 'Ergebnis der Smartboard-Pipeline-Audits.'}
      actions={
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[overall]}>
            {STATUS_LABEL[overall]} · {score}/100
          </Badge>
          <Button size="sm" variant="secondary" onClick={onRunCheck} disabled={isChecking}>
            {isChecking ? 'Prüfe…' : 'Erneut prüfen'}
          </Button>
          {onAutoRepair && (
            <Button
              size="sm"
              onClick={onAutoRepair}
              disabled={isRepairing || disableAutoRepair}
              title={
                disableAutoRepair
                  ? (autoRepairDisabledTitle ?? 'Keine automatische Reparatur in dieser Ansicht möglich.')
                  : undefined
              }
            >
              {isRepairing ? 'Repariere…' : 'Automatisch reparieren'}
            </Button>
          )}
        </div>
      }
    >
      <div className={cn('px-5 pt-3 pb-2 text-[12.5px]', overall === 'failed' ? 'text-rose-700' : 'text-slate-600')}>
        {report.warnings && report.warnings.length > 0 && (
          <details className="mb-2">
            <summary className="cursor-pointer text-[12.5px] font-semibold">
              {report.warnings.length} Warnung{report.warnings.length === 1 ? '' : 'en'}
            </summary>
            <ul className="mt-1 list-disc pl-5">
              {report.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <ul className="divide-y divide-slate-200">
        {sectionKeys.map((key) => (
          <SectionRow key={key} label={SECTION_LABELS[key]} section={report.sections?.[key]} />
        ))}
      </ul>
      {report.suggested_next_actions && report.suggested_next_actions.length > 0 && (
        <div className="border-t border-slate-200 px-5 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Empfohlene Aktionen</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-slate-700">
            {report.suggested_next_actions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <AssetEngineSection summary={assetsSummary} />
    </SectionCard>
  );
}
