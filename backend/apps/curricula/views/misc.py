"""Standalone APIViews for curricula (state options, worksheet matching)."""
from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.curricula.serializers import (
    CurriculumContextSerializer,
    CurriculumMatchRequestSerializer,
)
from apps.curricula.services.context_matching import CurriculumContextMatchingService
from apps.curricula.states import all_state_options
from apps.curricula.views.permissions import STAFF_CURRICULA_PERMS


class CurriculumStateOptionsView(APIView):
    permission_classes = STAFF_CURRICULA_PERMS

    def get(self, request):
        return Response({'options': all_state_options()})


class CurriculumMatchView(APIView):
    permission_classes = STAFF_CURRICULA_PERMS

    def post(self, request):
        ser = CurriculumMatchRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        matches = CurriculumContextMatchingService.find_best_contexts(
            state=d['state'],
            subject=d['subject'],
            grade=d.get('grade'),
            topic=d.get('topic') or '',
            limit=5,
        )
        out = []
        for m in matches:
            ctx = m['context']
            tv = CurriculumContextMatchingService.build_teacher_visible_usage(
                ctx,
                match_score=m['score'],
                match_reasons=m['reasons'],
            )
            out.append(
                {
                    'context': CurriculumContextSerializer(ctx).data,
                    'score': m['score'],
                    'reasons': m['reasons'],
                    'teacher_visible_summary': tv,
                },
            )
        return Response({'matches': out})
