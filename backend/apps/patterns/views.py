from rest_framework import viewsets, decorators, response, status

from apps.accounts.permissions import APIPaywallMixin
from .models import WorksheetPattern
from .serializers import WorksheetPatternSerializer
from .services import parse_blueprint, PatternBlueprintValidator

HELP={
 'summary':'Eine Vorlage ist ein YAML/JSON Blueprint mit Metadaten, Slots, Regeln und Layout-Hinweisen. PDFs sind im MVP keine echten Vorlagen.',
 'required_keys':['id','name','metadata','generation_rules','layout','slots'],
 'slot_types':['text','task_list','arithmetic_task_list','table','matching','fill_blank','solution_list','teacher_notes']
}
class PatternViewSet(APIPaywallMixin, viewsets.ModelViewSet):
    serializer_class=WorksheetPatternSerializer
    def get_queryset(self):
        return WorksheetPattern.objects.filter(status__in=['active','validated','draft']).order_by('-is_system','name')
    def perform_create(self, serializer): serializer.save(created_by=self.request.user)

    @decorators.action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        f=request.FILES.get('file')
        if not f: return response.Response({'detail':'file missing'}, status=400)
        try:
            bp, fmt=parse_blueprint(f.name, f.read())
            errors=PatternBlueprintValidator().validate(bp)
            pattern, _=WorksheetPattern.objects.update_or_create(
                key=bp.get('id','uploaded-pattern'), defaults={'name':bp.get('name','Uploaded Pattern'),'description':bp.get('description',''),'blueprint':bp,'source_format':fmt,'created_by':request.user,'status':'validated' if not errors else 'draft','last_validation_errors':errors,'preview_svg':bp.get('preview_svg','')})
            return response.Response(WorksheetPatternSerializer(pattern).data, status=201)
        except Exception as e:
            return response.Response({'detail':str(e)}, status=400)

    @decorators.action(detail=False, methods=['get'], url_path='format-help')
    def format_help(self, request): return response.Response(HELP)

    @decorators.action(detail=True, methods=['post'], url_path='validate')
    def validate_pattern(self, request, pk=None):
        p=self.get_object(); errors=PatternBlueprintValidator().validate(p.blueprint)
        p.last_validation_errors=errors; p.status='validated' if not errors else 'draft'; p.save()
        return response.Response({'valid': not errors, 'errors': errors})
