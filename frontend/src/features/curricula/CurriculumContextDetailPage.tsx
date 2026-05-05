import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader, Button, Card, Alert } from '../../components/ui';
import {
  activateCurriculumContext,
  archiveCurriculumContext,
  fetchCurriculumContext,
  matchCurriculum,
} from './curriculaApi';

export function CurriculumContextDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [matchState, setMatchState] = useState('Berlin/Brandenburg');
  const [matchSub, setMatchSub] = useState('Mathematik');
  const [matchGrade, setMatchGrade] = useState('2');
  const [matchTopic, setMatchTopic] = useState('Addition bis 20');
  const [matchOut, setMatchOut] = useState<string>('');
  const [err, setErr] = useState('');
  const [matchErr, setMatchErr] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    fetchCurriculumContext(id)
      .then((r) => setRow(r as unknown as Record<string, unknown>))
      .catch(() => setErr('Kontext nicht gefunden.'));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMatch = async () => {
    setMatchErr('');
    try {
      const g = matchGrade.trim() ? Number(matchGrade) : null;
      const res = await matchCurriculum({
        state: matchState.trim(),
        subject: matchSub.trim(),
        grade: Number.isFinite(g as number) ? (g as number) : null,
        topic: matchTopic.trim(),
      });
      setMatchOut(JSON.stringify(res, null, 2));
    } catch {
      setMatchErr('Matching fehlgeschlagen.');
    }
  };

  if (!id) return <p className="p-6">Ungültig.</p>;
  if (!row && !err) return <p className="p-6">Lade …</p>;
  if (!row) return <Alert tone="error">{err}</Alert>;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <PageHeader
        title={String(row.topic_area || 'Kontext')}
        subtitle={`${row.subject as string} · ${row.grade_band as string} · ${row.status as string}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void activateCurriculumContext(id).then(load)}>
              Aktivieren
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void archiveCurriculumContext(id).then(load)}>
              Archivieren
            </Button>
          </div>
        }
      />
      <Card className="!p-4 text-sm">
        <pre className="max-h-96 overflow-auto text-xs">{JSON.stringify(row, null, 2)}</pre>
      </Card>
      <Card className="!p-4">
        <h2 className="text-sm font-semibold">Matching testen</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className="input" value={matchState} onChange={(e) => setMatchState(e.target.value)} placeholder="Bundesland" />
          <input className="input" value={matchSub} onChange={(e) => setMatchSub(e.target.value)} placeholder="Fach" />
          <input className="input" value={matchGrade} onChange={(e) => setMatchGrade(e.target.value)} placeholder="Klasse" />
          <input className="input" value={matchTopic} onChange={(e) => setMatchTopic(e.target.value)} placeholder="Thema" />
        </div>
        <Button className="mt-3" variant="secondary" size="sm" onClick={() => void handleMatch()}>
          Match
        </Button>
        {matchOut ? <pre className="mt-3 max-h-64 overflow-auto text-xs">{matchOut}</pre> : null}
        {matchErr ? (
          <Alert className="mt-3" tone="error">
            {matchErr}
          </Alert>
        ) : null}
      </Card>
      {err ? <Alert tone="error">{err}</Alert> : null}
    </div>
  );
}
