# Generated manually for library listing + snapshot versioning.

import django.utils.timezone
from django.db import migrations, models


def backfill_library_snapshots(apps, schema_editor):
    Board = apps.get_model('boards', 'Board')
    now = django.utils.timezone.now()
    for b in Board.objects.filter(library_public=True):
        changed = False
        if not (b.library_listing_title or '').strip():
            b.library_listing_title = (b.title or '')[:255]
            changed = True
        if not (b.library_listing_topic or '').strip():
            b.library_listing_topic = (b.topic or '')[:220]
            changed = True
        if not (b.library_listing_description or '').strip():
            b.library_listing_description = (b.description or '')[:8000]
            changed = True
        if b.library_snapshot_at is None:
            b.library_snapshot_html = b.html or ''
            b.library_snapshot_css = b.css or ''
            b.library_snapshot_javascript = b.javascript or ''
            b.library_snapshot_used_libraries = list(b.used_libraries or [])
            b.library_snapshot_used_datasets = list(b.used_datasets or [])
            b.library_snapshot_at = b.library_published_at or now
            changed = True
        if changed:
            b.save()


class Migration(migrations.Migration):

    dependencies = [
        ('boards', '0011_student_link_expiry_backfill'),
    ]

    operations = [
        migrations.AddField(
            model_name='board',
            name='library_listing_description',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='board',
            name='library_listing_title',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='board',
            name='library_listing_topic',
            field=models.CharField(blank=True, max_length=220),
        ),
        migrations.AddField(
            model_name='board',
            name='library_snapshot_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='board',
            name='library_snapshot_css',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='board',
            name='library_snapshot_html',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='board',
            name='library_snapshot_javascript',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='board',
            name='library_snapshot_used_datasets',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='board',
            name='library_snapshot_used_libraries',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(backfill_library_snapshots, migrations.RunPython.noop),
    ]
