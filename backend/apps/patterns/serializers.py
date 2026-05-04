from rest_framework import serializers
from .models import WorksheetPattern
class WorksheetPatternSerializer(serializers.ModelSerializer):
    class Meta:
        model=WorksheetPattern
        fields='__all__'
        read_only_fields=['created_by','is_system','last_validation_errors']
