"""Bestehende Schüler-Links ohne Ablauf: 3 Tage ab Migration (Lastenschutz)."""
from datetime import timedelta

from django.db import migrations
from django.utils import timezone


def forwards_fill_student_link_expiry(apps, schema_editor):
    Board = apps.get_model('boards', 'Board')
    now = timezone.now()
    grace = timedelta(days=3)
    qs = Board.objects.filter(student_link_enabled=True, student_link_expires_at__isnull=True)
    qs.update(student_link_expires_at=now + grace)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('boards', '0010_board_student_link_expires_at'),
    ]

    operations = [
        migrations.RunPython(forwards_fill_student_link_expiry, noop_reverse),
    ]
