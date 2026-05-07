# Generated manually for library listing metadata (parity with boards).

from django.db import migrations, models


def backfill_listing_from_worksheet(apps, schema_editor):
    Worksheet = apps.get_model('worksheets', 'Worksheet')
    for w in Worksheet.objects.all().iterator():
        changed = []
        if not (w.library_listing_title or '').strip():
            w.library_listing_title = (w.title or '')[:255]
            changed.append('library_listing_title')
        if not (w.library_listing_topic or '').strip():
            w.library_listing_topic = (w.topic or '')[:220]
            changed.append('library_listing_topic')
        if changed:
            w.save(update_fields=changed)


class Migration(migrations.Migration):

    dependencies = [
        ('worksheets', '0004_library_moderation'),
    ]

    operations = [
        migrations.AddField(
            model_name='worksheet',
            name='library_listing_title',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='worksheet',
            name='library_listing_topic',
            field=models.CharField(blank=True, max_length=220),
        ),
        migrations.AddField(
            model_name='worksheet',
            name='library_listing_description',
            field=models.TextField(blank=True),
        ),
        migrations.RunPython(backfill_listing_from_worksheet, migrations.RunPython.noop),
    ]
