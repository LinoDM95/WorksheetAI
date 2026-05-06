"""Asset-Engine-Erweiterungen am Boards-Schema.

- ``Board.assets_summary``: Composer-Ausgabe für Code-Prompt + Frontend-Anzeige.
- ``AIUsageLog.step_type``: neue Asset-Engine-Schritte.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('boards', '0006_smartboard_pipeline'),
    ]

    operations = [
        migrations.AddField(
            model_name='board',
            name='assets_summary',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name='aiusagelog',
            name='step_type',
            field=models.CharField(
                choices=[
                    ('intent', 'Intent'),
                    ('risk', 'Risk'),
                    ('creative_brief', 'Creative Brief'),
                    ('style_dna', 'Style DNA'),
                    ('code_generation', 'Code-Generierung'),
                    ('repair', 'Reparatur'),
                    ('screenshot_judge', 'Screenshot-Judge'),
                    ('revision', 'Revision'),
                    ('asset_intent', 'Asset Intent'),
                    ('asset_plan', 'Asset Plan'),
                    ('asset_strategy', 'Asset Strategy'),
                    ('asset_svg_generation', 'Asset SVG Generation'),
                    ('asset_repair', 'Asset Repair'),
                    ('asset_quality_judge', 'Asset Quality Judge'),
                    ('asset_pack_consistency', 'Asset Pack Consistency'),
                    ('asset_pack_generation', 'Asset Pack Generation'),
                ],
                max_length=40,
            ),
        ),
    ]
