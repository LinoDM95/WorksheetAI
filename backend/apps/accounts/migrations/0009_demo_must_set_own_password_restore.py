"""Nach 0008 wieder: Demo-Konten mit Gemeinschaftspasswort sollen eigenes Passwort setzen."""

from django.db import migrations


def set_flag_for_demo_profiles(apps, schema_editor):
    UserProfile = apps.get_model('accounts', 'UserProfile')
    UserProfile.objects.filter(is_demo=True).update(demo_must_set_own_password=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [('accounts', '0008_clear_demo_must_set_own_password')]

    operations = [migrations.RunPython(set_flag_for_demo_profiles, noop_reverse)]
