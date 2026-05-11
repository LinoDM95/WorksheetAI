# Generated manually

from django.db import migrations, models


def forwards_category(apps, schema_editor):
    Board = apps.get_model('boards', 'Board')
    presentation_types = {
        'lesson_intro',
        'explanation_board',
        'map_board',
        'simulation_board',
    }
    task_types = {'practice_board', 'quiz_board'}
    for b in Board.objects.filter(library_listing_category='').iterator():
        t = (b.board_type or 'interactive_board').strip()
        if t in task_types:
            cat = 'tasks'
        elif t == 'interactive_board':
            cat = 'games'
        elif t in presentation_types:
            cat = 'presentations'
        else:
            cat = 'presentations'
        Board.objects.filter(pk=b.pk).update(library_listing_category=cat)


class Migration(migrations.Migration):

    dependencies = [
        ('boards', '0015_board_library_classification_snapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='board',
            name='library_listing_category',
            field=models.CharField(blank=True, choices=[
                ('tasks', 'Aufgaben'),
                ('games', 'Spiele'),
                ('presentations', 'Präsentation'),
            ], default='', max_length=20),
        ),
        migrations.RunPython(forwards_category, migrations.RunPython.noop),
    ]
