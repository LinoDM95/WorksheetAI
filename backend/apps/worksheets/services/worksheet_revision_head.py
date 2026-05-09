"""Versionskopf für Arbeitsblätter (KI-Änderungen / Wiederherstellen wie bei Boards)."""
from __future__ import annotations

import copy
import json
from typing import Any

from django.contrib.auth.models import User
from django.db import transaction

from apps.boards.models import REVISION_MODE_CHOICES
from apps.worksheets.models import Worksheet, WorksheetRevision

_REVISION_MODE_CODES = frozenset(m[0] for m in REVISION_MODE_CHOICES)


def _json_stable(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, default=str)


def worksheet_metadata_snapshot(ws: Worksheet) -> dict[str, Any]:
    return {
        'title': ws.title or '',
        'subject': ws.subject or '',
        'grade': ws.grade,
        'topic': ws.topic or '',
    }


def latest_revision(ws: Worksheet) -> WorksheetRevision | None:
    return ws.revisions.order_by('-created_at').first()


def worksheet_bundle_matches_revision_new(ws: Worksheet, rev: WorksheetRevision) -> bool:
    wc = ws.content if isinstance(ws.content, dict) else {}
    wrm = ws.render_model if isinstance(ws.render_model, dict) else {}
    nc = rev.new_content if isinstance(rev.new_content, dict) else {}
    nrm = rev.new_render_model if isinstance(rev.new_render_model, dict) else {}
    return _json_stable(wc) == _json_stable(nc) and _json_stable(wrm) == _json_stable(nrm)


def worksheet_matches_revision_metadata(ws: Worksheet, nm: dict[str, Any]) -> bool:
    if 'title' in nm and (ws.title or '') != str(nm.get('title') or ''):
        return False
    if 'subject' in nm and (ws.subject or '') != str(nm.get('subject') or ''):
        return False
    if 'topic' in nm and (ws.topic or '') != str(nm.get('topic') or ''):
        return False
    if 'grade' in nm:
        gv = nm.get('grade')
        if ws.grade != gv:
            return False
    return True


def worksheet_matches_revision_head(ws: Worksheet, rev: WorksheetRevision | None = None) -> bool:
    r = rev if rev is not None else latest_revision(ws)
    if r is None:
        return True
    if not worksheet_bundle_matches_revision_new(ws, r):
        return False
    nm = r.new_metadata if isinstance(r.new_metadata, dict) else {}
    tracked = ('title', 'subject', 'topic', 'grade')
    if not any(k in nm for k in tracked):
        return True
    return worksheet_matches_revision_metadata(ws, nm)


def require_worksheet_at_revision_head(ws: Worksheet) -> None:
    ws.refresh_from_db()
    if worksheet_matches_revision_head(ws):
        return
    raise ValueError(
        'KI-Überarbeitung ist nur auf dem aktuellen Stand (neueste Version) möglich. '
        'Stelle eine Version wieder her oder wähle „Aktueller Stand“.',
    )


def revision_revert_restore_bundle(
    rev: WorksheetRevision,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Zielzustand für API-Revert (letzte Revision zurücknehmen).

    Alte Initial-Snapshots hatten previous_* leer und new_* = Ist-Stand — Revert darf das Blatt nicht leeren.
    """
    pc = rev.previous_content if isinstance(rev.previous_content, dict) else {}
    prm = rev.previous_render_model if isinstance(rev.previous_render_model, dict) else {}
    pm = rev.previous_metadata if isinstance(rev.previous_metadata, dict) else {}
    nc = rev.new_content if isinstance(rev.new_content, dict) else {}
    nrm = rev.new_render_model if isinstance(rev.new_render_model, dict) else {}
    nm = rev.new_metadata if isinstance(rev.new_metadata, dict) else {}
    if pc == {} and prm == {} and (nc or nrm):
        return copy.deepcopy(nc), copy.deepcopy(nrm), copy.deepcopy(nm)
    return copy.deepcopy(pc), copy.deepcopy(prm), copy.deepcopy(pm)


def create_initial_revision_if_absent(
    ws: Worksheet,
    *,
    user: User | None,
    prompt: str,
) -> WorksheetRevision | None:
    if ws.revisions.exists():
        return None
    ws.refresh_from_db()
    meta = worksheet_metadata_snapshot(ws)
    c = ws.content if isinstance(ws.content, dict) else {}
    rm = ws.render_model if isinstance(ws.render_model, dict) else {}
    meta_copy = copy.deepcopy(meta)
    return WorksheetRevision.objects.create(
        worksheet=ws,
        prompt=str(prompt or '')[:4000],
        revision_mode='general',
        previous_content=copy.deepcopy(c),
        new_content=copy.deepcopy(c),
        previous_render_model=copy.deepcopy(rm),
        new_render_model=copy.deepcopy(rm),
        previous_metadata=meta_copy,
        new_metadata=meta_copy,
        ai_raw_output={'source': 'initial_snapshot'},
        validation_errors=[],
        validation_warnings=[],
        created_by=user,
    )


def append_manual_content_revision(
    ws: Worksheet,
    *,
    user: User | None,
    prev_content: dict[str, Any],
    prev_render_model: dict[str, Any],
    prev_meta: dict[str, Any],
) -> WorksheetRevision:
    ws.refresh_from_db()
    return WorksheetRevision.objects.create(
        worksheet=ws,
        prompt='(Manuelle Bearbeitung)',
        revision_mode='general',
        previous_content=copy.deepcopy(prev_content),
        new_content=copy.deepcopy(ws.content) if isinstance(ws.content, dict) else {},
        previous_render_model=copy.deepcopy(prev_render_model),
        new_render_model=copy.deepcopy(ws.render_model) if isinstance(ws.render_model, dict) else {},
        previous_metadata=copy.deepcopy(prev_meta),
        new_metadata=worksheet_metadata_snapshot(ws),
        ai_raw_output={'source': 'manual_patch'},
        validation_errors=[],
        validation_warnings=[],
        created_by=user,
    )


def persist_worksheet_after_ai_regenerate(
    ws: Worksheet,
    *,
    user: User | None,
    prev_content: dict[str, Any],
    prev_render_model: dict[str, Any],
    prev_meta: dict[str, Any],
    new_content: dict[str, Any],
    new_render_model: dict[str, Any],
    prompt: str,
    revision_mode: str = 'general',
    ai_raw_output: dict[str, Any] | None = None,
    validation_notes: list[str] | None = None,
) -> WorksheetRevision:
    with transaction.atomic():
        ws.content = copy.deepcopy(new_content)
        ws.render_model = copy.deepcopy(new_render_model)
        if isinstance(new_content, dict) and new_content.get('title'):
            ws.title = str(new_content.get('title') or '')[:255]
        ws.save(update_fields=['content', 'render_model', 'title', 'updated_at'])
        return record_ai_page_revision(
            ws,
            user=user,
            prompt=prompt,
            revision_mode=revision_mode,
            prev_content=prev_content,
            prev_render_model=prev_render_model,
            prev_meta=prev_meta,
            new_content=new_content,
            new_render_model=new_render_model,
            ai_raw_output=ai_raw_output,
            validation_errors=[],
            validation_warnings=list(validation_notes or []),
        )


def record_ai_page_revision(
    ws: Worksheet,
    *,
    user: User | None,
    prompt: str,
    revision_mode: str,
    prev_content: dict[str, Any],
    prev_render_model: dict[str, Any],
    prev_meta: dict[str, Any],
    new_content: dict[str, Any],
    new_render_model: dict[str, Any],
    ai_raw_output: dict[str, Any] | None = None,
    validation_errors: list | None = None,
    validation_warnings: list | None = None,
) -> WorksheetRevision:
    ws.refresh_from_db()
    nm_new = worksheet_metadata_snapshot(ws)
    mode = revision_mode if revision_mode in _REVISION_MODE_CODES else 'general'
    return WorksheetRevision.objects.create(
        worksheet=ws,
        prompt=str(prompt or '')[:4000],
        revision_mode=mode,
        previous_content=copy.deepcopy(prev_content),
        new_content=copy.deepcopy(new_content),
        previous_render_model=copy.deepcopy(prev_render_model),
        new_render_model=copy.deepcopy(new_render_model),
        previous_metadata=copy.deepcopy(prev_meta),
        new_metadata=nm_new,
        ai_raw_output=dict(ai_raw_output or {}),
        validation_errors=list(validation_errors or []),
        validation_warnings=list(validation_warnings or []),
        created_by=user,
    )


def apply_revision_to_worksheet(
    ws: Worksheet,
    *,
    target: WorksheetRevision,
    user: User | None,
) -> WorksheetRevision:
    latest = latest_revision(ws)
    if latest is None:
        raise ValueError('Keine Versionshistorie — Wiederherstellen nicht möglich.')

    ws.refresh_from_db()
    require_worksheet_at_revision_head(ws)

    if target.worksheet_id != ws.id:
        raise ValueError('Unbekannte Revision für dieses Arbeitsblatt.')

    if latest.id == target.id:
        return latest

    snapshot_prev_content = copy.deepcopy(ws.content) if isinstance(ws.content, dict) else {}
    snapshot_prev_rm = copy.deepcopy(ws.render_model) if isinstance(ws.render_model, dict) else {}
    prev_meta = worksheet_metadata_snapshot(ws)

    nc = target.new_content if isinstance(target.new_content, dict) else {}
    nrm = target.new_render_model if isinstance(target.new_render_model, dict) else {}
    nm = target.new_metadata if isinstance(target.new_metadata, dict) else {}

    with transaction.atomic():
        ws.content = copy.deepcopy(nc)
        ws.render_model = copy.deepcopy(nrm)
        if 'title' in nm:
            ws.title = str(nm.get('title') or '')[:255]
        elif isinstance(nc, dict) and nc.get('title'):
            ws.title = str(nc.get('title') or '')[:255]
        if 'subject' in nm:
            ws.subject = str(nm.get('subject') or '')[:120]
        if 'topic' in nm:
            ws.topic = str(nm.get('topic') or '')[:255]
        if 'grade' in nm:
            ws.grade = nm.get('grade')
        ws.save()

        restore = WorksheetRevision.objects.create(
            worksheet=ws,
            prompt=f'(Wiederherstellung vom {target.created_at.strftime("%d.%m.%Y %H:%M")})'[:4000],
            revision_mode='general',
            previous_content=snapshot_prev_content,
            new_content=copy.deepcopy(ws.content) if isinstance(ws.content, dict) else {},
            previous_render_model=snapshot_prev_rm,
            new_render_model=copy.deepcopy(ws.render_model) if isinstance(ws.render_model, dict) else {},
            previous_metadata=prev_meta,
            new_metadata=worksheet_metadata_snapshot(ws),
            ai_raw_output={'restored_revision_id': str(target.id)},
            validation_errors=[],
            validation_warnings=[],
            created_by=user,
        )

    return restore