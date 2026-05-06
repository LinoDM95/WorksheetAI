from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('boards', '0009_backfill_boardrevision_head'),
    ]

    operations = [
        migrations.AddField(
            model_name='board',
            name='student_link_expires_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
