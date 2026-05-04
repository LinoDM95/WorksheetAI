from rest_framework import serializers
from .models import FederalState, SchoolType, Subject, GradeLevel, CurriculumUnit
class FederalStateSerializer(serializers.ModelSerializer):
    class Meta: model=FederalState; fields='__all__'
class SchoolTypeSerializer(serializers.ModelSerializer):
    class Meta: model=SchoolType; fields='__all__'
class SubjectSerializer(serializers.ModelSerializer):
    class Meta: model=Subject; fields='__all__'
class GradeLevelSerializer(serializers.ModelSerializer):
    class Meta: model=GradeLevel; fields='__all__'
class CurriculumUnitSerializer(serializers.ModelSerializer):
    class Meta: model=CurriculumUnit; fields='__all__'
