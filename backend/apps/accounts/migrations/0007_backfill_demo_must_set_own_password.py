"""Bestehende Demo-Profile hatten nach Einführung von 0006 demo_must_set_own_password=False.

Alle aktiven Demo-Konten sollen weiterhin ihr eigenes Passwort setzen müssen."""
from django.db import migrations


def forwards(apps, schema_editor):
    UserProfile = apps.get_model('accounts', 'UserProfile')
    UserProfile.objects.filter(is_demo=True, demo_must_set_own_password=False).update(
        demo_must_set_own_password=True,
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [('accounts', '0006_userprofile_demo_must_set_own_password')]

    operations = [
        migrations.RunPython(forwards, noop_reverse),
    ]
