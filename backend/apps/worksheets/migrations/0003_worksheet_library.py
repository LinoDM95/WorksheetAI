from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('worksheets', '0002_generation_meta'),
    ]

    operations = [
        migrations.AddField(
            model_name='worksheet',
            name='library_public',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='worksheet',
            name='library_published_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
