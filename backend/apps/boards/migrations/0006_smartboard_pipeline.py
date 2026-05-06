# Generated manually for Smartboard Kreativmodus-Pipeline.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('boards', '0005_board_sharing_library_rating'),
    ]

    operations = [
        # Board: Pipeline-Artefakte
        migrations.AddField(model_name='board', name='creative_brief', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='style_dna', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='intent_analysis', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='risk_analysis', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='quality_report', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='browser_test_result', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='touch_audit_result', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='screenshot_quality_result', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='repair_history', field=models.JSONField(blank=True, default=list)),
        migrations.AddField(model_name='board', name='used_model_config', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='token_usage', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='estimated_cost', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='board', name='is_quality_example', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='board', name='quality_tags', field=models.JSONField(blank=True, default=list)),
        migrations.AddField(model_name='board', name='reuse_pattern_summary', field=models.TextField(blank=True)),
        # BoardRevision: Modus + Reports
        migrations.AddField(
            model_name='boardrevision',
            name='revision_mode',
            field=models.CharField(
                choices=[
                    ('general', 'Allgemein'),
                    ('bug_fix', 'Fehler beheben'),
                    ('design_improve', 'Design verbessern'),
                    ('touch_optimize', 'Touch optimieren'),
                    ('content_change', 'Inhalt ändern'),
                    ('simplify', 'Vereinfachen'),
                    ('make_more_creative', 'Kreativer machen'),
                    ('performance_improve', 'Performance verbessern'),
                ],
                default='general',
                max_length=30,
            ),
        ),
        migrations.AddField(model_name='boardrevision', name='quality_report_before', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='boardrevision', name='quality_report_after', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='boardrevision', name='repair_notes', field=models.JSONField(blank=True, default=list)),
        migrations.AddField(model_name='boardrevision', name='used_model_config', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='boardrevision', name='token_usage', field=models.JSONField(blank=True, default=dict)),
        # AIUsageLog
        migrations.CreateModel(
            name='AIUsageLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('step_type', models.CharField(
                    choices=[
                        ('intent', 'Intent'),
                        ('risk', 'Risk'),
                        ('creative_brief', 'Creative Brief'),
                        ('style_dna', 'Style DNA'),
                        ('code_generation', 'Code-Generierung'),
                        ('repair', 'Reparatur'),
                        ('screenshot_judge', 'Screenshot-Judge'),
                        ('revision', 'Revision'),
                    ],
                    max_length=40,
                )),
                ('model_name', models.CharField(max_length=100)),
                ('input_tokens', models.IntegerField(default=0)),
                ('output_tokens', models.IntegerField(default=0)),
                ('estimated_cost_cents', models.IntegerField(default=0)),
                ('success', models.BooleanField(default=True)),
                ('error_message', models.TextField(blank=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('board', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='ai_usage',
                    to='boards.board',
                )),
                ('user', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='ai_usage_logs',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.AddIndex(
            model_name='aiusagelog',
            index=models.Index(fields=['step_type', 'created_at'], name='boards_aius_step_ty_a8c6f3_idx'),
        ),
        migrations.AddIndex(
            model_name='aiusagelog',
            index=models.Index(fields=['board', 'step_type'], name='boards_aius_board_i_5e8b22_idx'),
        ),
    ]
