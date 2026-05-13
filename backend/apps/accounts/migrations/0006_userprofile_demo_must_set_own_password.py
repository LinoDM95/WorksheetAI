from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [('accounts', '0005_user_profile_demo')]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='demo_must_set_own_password',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text='True: Demo-Login noch mit Gemeinschaftspasswort — Nutzer:in muss erst ein eigenes setzen.',
            ),
        ),
    ]
