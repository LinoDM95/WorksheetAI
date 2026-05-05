from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('curricula', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='curriculumsource',
            name='title',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='curriculumsource',
            name='discovery_status',
            field=models.CharField(
                choices=[
                    ('not_run', 'Nicht gelaufen'),
                    ('running', 'Auto-Discovery läuft …'),
                    ('done', 'Plan erstellt'),
                    ('failed', 'Discovery fehlgeschlagen'),
                ],
                default='not_run',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='curriculumsource',
            name='discovery_plan',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='curriculumsource',
            name='discovery_error',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='curriculumsource',
            name='replicate_states',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='curriculumsource',
            name='auto_run_id',
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='curriculumextractionjob',
            name='auto_run_id',
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='curriculumextractionjob',
            name='plan_index',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='curriculumextractionjob',
            index=models.Index(fields=['source', 'auto_run_id'], name='curricula_c_source__75f5a0_idx'),
        ),
        migrations.AddIndex(
            model_name='curriculumextractionjob',
            index=models.Index(fields=['auto_run_id'], name='curricula_c_auto_ru_8a2bdd_idx'),
        ),
    ]
