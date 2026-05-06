# Generated manually for board versioning (initial snapshot per legacy board).

from django.db import migrations


def forwards(apps, schema_editor):
    Board = apps.get_model('boards', 'Board')
    BoardRevision = apps.get_model('boards', 'BoardRevision')
    boards = Board.objects.all()
    for board in boards.iterator():
        if BoardRevision.objects.filter(board_id=board.pk).exists():
            continue
        has_code = bool(
            (getattr(board, 'html', None) or '').strip()
            or (getattr(board, 'css', None) or '').strip()
            or (getattr(board, 'javascript', None) or '').strip(),
        )
        if not has_code:
            continue
        BoardRevision.objects.create(
            board_id=board.pk,
            prompt='(Bestand, ohne frühere History)',
            revision_mode='general',
            previous_html='',
            previous_css='',
            previous_javascript='',
            previous_metadata=dict(),
            new_html=board.html or '',
            new_css=board.css or '',
            new_javascript=board.javascript or '',
            new_metadata={
                'title': board.title or '',
                'description': board.description or '',
                'teacher_notes': board.teacher_notes or '',
                'usage_instructions': list(board.usage_instructions or []),
                'warnings': list(board.warnings or []),
                'used_libraries': list(board.used_libraries or []),
                'used_assets': list(board.used_assets or []),
                'used_datasets': list(board.used_datasets or []),
            },
            ai_raw_output={'source': 'migration_backfill'},
            validation_errors=list(board.validation_errors or []),
            validation_warnings=list(board.validation_warnings or []),
            created_by_id=getattr(board, 'owner_id', None),
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('boards', '0008_board_library_comment'),
    ]

    operations = [
        migrations.RunPython(forwards, noop_reverse),
    ]
