"""Flat Free-HTML5-Architektur: html/css/javascript als eigene Spalten.

Schritte:
1. Neue Spalten anlegen.
2. Bestehende `free_html` JSON-Bündel und Revisions-Bündel in die flachen Spalten kopieren.
3. Alte Spalten (`spec`, `generation_mode`, `free_html`, `sandbox_options`,
   `previous_spec`, `new_spec`, `previous_free_html`, `new_free_html`) entfernen.
"""
from __future__ import annotations

from django.db import migrations, models


def copy_free_html_to_flat(apps, schema_editor):
    Board = apps.get_model('boards', 'Board')
    BoardRevision = apps.get_model('boards', 'BoardRevision')

    for board in Board.objects.all().iterator():
        bundle = board.free_html if isinstance(board.free_html, dict) else {}
        is_free = getattr(board, 'generation_mode', 'structured') == 'free_html'
        if is_free:
            board.html = str(bundle.get('html') or '')
            board.css = str(bundle.get('css') or '')
            board.javascript = str(bundle.get('javascript') or '')
            board.teacher_notes = str(bundle.get('teacher_notes') or bundle.get('notes') or '')
            ui = bundle.get('usage_instructions')
            board.usage_instructions = list(ui) if isinstance(ui, list) else []
            wn = bundle.get('warnings')
            board.warnings = list(wn) if isinstance(wn, list) else []
        else:
            board.html = ''
            board.css = ''
            board.javascript = ''
            board.teacher_notes = ''
            board.usage_instructions = []
            board.warnings = []
        board.used_libraries = []
        board.used_assets = []
        board.used_datasets = []
        board.validation_warnings = []
        board.save(update_fields=[
            'html', 'css', 'javascript',
            'teacher_notes', 'usage_instructions', 'warnings',
            'used_libraries', 'used_assets', 'used_datasets',
            'validation_warnings',
        ])

    for rev in BoardRevision.objects.all().iterator():
        prev = rev.previous_free_html if isinstance(rev.previous_free_html, dict) else {}
        new = rev.new_free_html if isinstance(rev.new_free_html, dict) else {}
        is_free = getattr(rev, 'generation_mode', 'structured') == 'free_html'
        if is_free:
            rev.previous_html = str(prev.get('html') or '')
            rev.previous_css = str(prev.get('css') or '')
            rev.previous_javascript = str(prev.get('javascript') or '')
            rev.new_html = str(new.get('html') or '')
            rev.new_css = str(new.get('css') or '')
            rev.new_javascript = str(new.get('javascript') or '')
        rev.previous_metadata = {}
        rev.new_metadata = {}
        rev.validation_warnings = []
        rev.save(update_fields=[
            'previous_html', 'previous_css', 'previous_javascript',
            'new_html', 'new_css', 'new_javascript',
            'previous_metadata', 'new_metadata', 'validation_warnings',
        ])


def noop_reverse(apps, schema_editor):  # pragma: no cover - one-way
    return


class Migration(migrations.Migration):

    dependencies = [
        ('boards', '0002_board_free_html'),
    ]

    operations = [
        # 1. Neue Spalten auf Board
        migrations.AddField(
            model_name='board',
            name='html',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='board',
            name='css',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='board',
            name='javascript',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='board',
            name='teacher_notes',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='board',
            name='usage_instructions',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='board',
            name='warnings',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='board',
            name='used_libraries',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='board',
            name='used_assets',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='board',
            name='used_datasets',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='board',
            name='validation_warnings',
            field=models.JSONField(default=list),
        ),
        # board_type Choices erweitern
        migrations.AlterField(
            model_name='board',
            name='board_type',
            field=models.CharField(
                choices=[
                    ('interactive_board', 'Interaktives Board'),
                    ('lesson_intro', 'Stundeneinstieg'),
                    ('practice_board', 'Übungstafel'),
                    ('explanation_board', 'Erklärtafel'),
                    ('quiz_board', 'Quiz-Tafel'),
                    ('map_board', 'Karten-Tafel'),
                    ('simulation_board', 'Simulation'),
                ],
                default='interactive_board',
                max_length=40,
            ),
        ),

        # 2. Neue Spalten auf BoardRevision
        migrations.AddField(
            model_name='boardrevision',
            name='previous_html',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='boardrevision',
            name='previous_css',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='boardrevision',
            name='previous_javascript',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='boardrevision',
            name='new_html',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='boardrevision',
            name='new_css',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='boardrevision',
            name='new_javascript',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='boardrevision',
            name='previous_metadata',
            field=models.JSONField(default=dict),
        ),
        migrations.AddField(
            model_name='boardrevision',
            name='new_metadata',
            field=models.JSONField(default=dict),
        ),
        migrations.AddField(
            model_name='boardrevision',
            name='validation_warnings',
            field=models.JSONField(default=list),
        ),
        migrations.AlterField(
            model_name='boardrevision',
            name='prompt',
            field=models.TextField(blank=True),
        ),

        # 3. Daten kopieren
        migrations.RunPython(copy_free_html_to_flat, noop_reverse),

        # 4. Alte Spalten entfernen
        migrations.RemoveField(model_name='board', name='spec'),
        migrations.RemoveField(model_name='board', name='generation_mode'),
        migrations.RemoveField(model_name='board', name='free_html'),
        migrations.RemoveField(model_name='board', name='sandbox_options'),
        migrations.RemoveField(model_name='boardrevision', name='generation_mode'),
        migrations.RemoveField(model_name='boardrevision', name='previous_spec'),
        migrations.RemoveField(model_name='boardrevision', name='new_spec'),
        migrations.RemoveField(model_name='boardrevision', name='previous_free_html'),
        migrations.RemoveField(model_name='boardrevision', name='new_free_html'),
    ]
