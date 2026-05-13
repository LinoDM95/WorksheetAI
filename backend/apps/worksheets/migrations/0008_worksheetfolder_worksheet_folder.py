import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('worksheets', '0007_worksheet_library_ratings_comments'),
    ]

    operations = [
        migrations.CreateModel(
            name='WorksheetFolder',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=120)),
                ('sort_order', models.PositiveSmallIntegerField(default=0)),
                (
                    'owner',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='worksheet_folders',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    'parent',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='children',
                        to='worksheets.worksheetfolder',
                    ),
                ),
            ],
            options={
                'ordering': ['sort_order', 'name'],
            },
        ),
        migrations.AddConstraint(
            model_name='worksheetfolder',
            constraint=models.UniqueConstraint(
                fields=('owner', 'parent', 'name'),
                name='worksheet_folder_owner_parent_name_uniq',
            ),
        ),
        migrations.AddField(
            model_name='worksheet',
            name='folder',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='worksheets',
                to='worksheets.worksheetfolder',
            ),
        ),
    ]
