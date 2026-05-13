"""Demo: kein Zwangs-Passwort mehr vor Finalize — Flag für alle Demo-Profile zurücksetzen."""

from django.db import migrations


def clear_demo_must(apps, schema_editor):
    UserProfile = apps.get_model('accounts', 'UserProfile')
    UserProfile.objects.filter(is_demo=True).update(demo_must_set_own_password=False)


class Migration(migrations.Migration):
    dependencies = [('accounts', '0007_backfill_demo_must_set_own_password')]

    operations = [migrations.RunPython(clear_demo_must, migrations.RunPython.noop)]
