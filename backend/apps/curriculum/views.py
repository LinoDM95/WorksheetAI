from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import viewsets
from .models import FederalState, SchoolType, Subject, GradeLevel, CurriculumUnit
from .serializers import *

class OptionsView(APIView):
    def get(self, request):
        return Response({
            'federal_states': FederalStateSerializer(FederalState.objects.all(), many=True).data,
            'school_types': SchoolTypeSerializer(SchoolType.objects.all(), many=True).data,
            'subjects': SubjectSerializer(Subject.objects.all(), many=True).data,
            'grade_levels': GradeLevelSerializer(GradeLevel.objects.order_by('value'), many=True).data,
        })
class UnitViewSet(viewsets.ReadOnlyModelViewSet):
    queryset=CurriculumUnit.objects.all()
    serializer_class=CurriculumUnitSerializer
