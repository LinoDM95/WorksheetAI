# Generated manually

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('boards', '0004_boardfolder_board_folder'),
    ]

    operations = [
        migrations.AddField(
            model_name='board',
            name='share_token',
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='board',
            name='student_link_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='board',
            name='library_public',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='board',
            name='library_published_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='board',
            name='source_board',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='derived_boards',
                to='boards.board',
            ),
        ),
        migrations.CreateModel(
            name='BoardRating',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('stars', models.PositiveSmallIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('board', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ratings', to='boards.board')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='board_ratings', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='boardrating',
            constraint=models.UniqueConstraint(fields=('board', 'user'), name='board_rating_board_user_uniq'),
        ),
    ]
