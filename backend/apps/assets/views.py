"""HTTP-Views der Asset-Engine.

Enthält:
- ``AssetSvgView``: lokale SVG-Auslieferung unter ``/board-generated-assets/<id>.svg``
- DRF-Views für Pack-/Asset-Verwaltung unter ``/api/assets/...``.

Owner-Check:
- Eigentümer eines Assets/Packs (über ``owner`` oder ``board.owner``) hat Zugriff.
- Boards mit ``library_public=True`` machen ihre Assets öffentlich lesbar.
"""

from __future__ import annotations

from django.conf import settings
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.views import View
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.services.credits import enforce_positive_ai_credits_balance
from apps.boards.owner import resolve_board_owner

from .models import AssetPack, GeneratedAsset
from .serializers import (
    AssetPackBriefSerializer,
    AssetPackSerializer,
    GeneratedAssetSerializer,
)


def _user_can_view_asset(viewer, asset: GeneratedAsset) -> bool:
    if asset.board and asset.board.library_public:
        return True
    if not viewer:
        return False
    if getattr(viewer, 'is_staff', False):
        return True
    if asset.owner_id and asset.owner_id == viewer.id:
        return True
    if asset.board and asset.board.owner_id == viewer.id:
        return True
    if asset.asset_pack and asset.asset_pack.owner_id == viewer.id:
        return True
    return False


def _user_can_view_pack(viewer, pack: AssetPack) -> bool:
    if pack.board and pack.board.library_public:
        return True
    if not viewer:
        return False
    if getattr(viewer, 'is_staff', False):
        return True
    if pack.owner_id and pack.owner_id == viewer.id:
        return True
    if pack.board and pack.board.owner_id == viewer.id:
        return True
    return False


def _asset_viewer_from_request(request) -> object | None:
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return user
    if not getattr(settings, 'API_REQUIRE_AUTH', True):
        try:
            return resolve_board_owner(user)
        except ValueError:
            return None
    return None


def _resolve_board_context_user(request) -> object | None:
    try:
        return resolve_board_owner(request.user)
    except ValueError:
        return None


class DevOrAuthAssetPermissionMixin:
    def get_permissions(self):
        if getattr(settings, 'API_REQUIRE_AUTH', True):
            return [IsAuthenticated()]
        return [AllowAny()]


class AssetSvgView(View):
    """Liefert ein normalisiertes SVG aus, ohne Browser-Caching zu erlauben.

    Pfad: ``/board-generated-assets/<uuid>.svg``. Bewusst CSRF-frei (GET-only)
    und ohne Authentication-Zwang, falls das Board public ist.
    """

    permission_classes: list = []  # type: ignore[var-annotated]

    def get(self, request, asset_id):  # noqa: D401 — Django-View-Signatur
        asset = get_object_or_404(GeneratedAsset, pk=asset_id)
        viewer = _asset_viewer_from_request(request)
        if not _user_can_view_asset(viewer, asset):
            raise Http404
        body = asset.normalized_svg or asset.svg or ''
        if not body:
            raise Http404
        response = HttpResponse(body, content_type='image/svg+xml; charset=utf-8')
        response['Cache-Control'] = 'private, max-age=300'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'"
        return response


class AssetPackListView(DevOrAuthAssetPermissionMixin, APIView):
    def get(self, request):
        viewer = _resolve_board_context_user(request)
        if viewer is None:
            return Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        qs = AssetPack.objects.all()
        if request.user.is_authenticated and request.user.is_staff:
            pass
        else:
            qs = qs.filter(owner=viewer)
        qs = qs.order_by('-created_at')[:200]
        return Response(AssetPackBriefSerializer(qs, many=True).data)


class AssetPackDetailView(DevOrAuthAssetPermissionMixin, APIView):
    def get(self, request, pack_id):
        viewer = _resolve_board_context_user(request)
        if viewer is None:
            return Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        pack = get_object_or_404(AssetPack, pk=pack_id)
        if not _user_can_view_pack(viewer, pack):
            return Response({'detail': 'Kein Zugriff.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(AssetPackSerializer(pack).data)


class AssetPackRepairView(DevOrAuthAssetPermissionMixin, APIView):
    def post(self, request, pack_id):
        from .services.asset_pack_service import AssetPackGenerationService

        viewer = _resolve_board_context_user(request)
        if viewer is None:
            return Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        pack = get_object_or_404(AssetPack, pk=pack_id)
        if not _user_can_view_pack(viewer, pack):
            return Response({'detail': 'Kein Zugriff.'}, status=status.HTTP_403_FORBIDDEN)
        enforce_positive_ai_credits_balance(viewer)
        service = AssetPackGenerationService(user=viewer, board=pack.board)
        try:
            service.repair_pack(pack)
        except Exception as exc:  # noqa: BLE001 — fail-soft
            return Response({'detail': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response(AssetPackSerializer(pack).data)


class AssetPackSelectVariantView(DevOrAuthAssetPermissionMixin, APIView):
    def post(self, request, pack_id):
        viewer = _resolve_board_context_user(request)
        if viewer is None:
            return Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        pack = get_object_or_404(AssetPack, pk=pack_id)
        if not _user_can_view_pack(viewer, pack):
            return Response({'detail': 'Kein Zugriff.'}, status=status.HTTP_403_FORBIDDEN)
        asset_key = request.data.get('asset_key')
        variant_id = request.data.get('variant_id')
        if not asset_key or not variant_id:
            return Response(
                {'detail': 'asset_key und variant_id erforderlich.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Variant-Auswahl: setze gewünschtes Asset als is_reusable und mark unused-Varianten als archived.
        # MVP: nur Flagging — keine echte Variant-Tabelle.
        target = pack.assets.filter(pk=variant_id).first()
        if not target:
            return Response({'detail': 'Variante nicht gefunden.'}, status=status.HTTP_404_NOT_FOUND)
        target.is_reusable = True
        target.metadata = {**(target.metadata or {}), 'selected_variant': True}
        target.save(update_fields=['is_reusable', 'metadata', 'updated_at'])
        return Response(GeneratedAssetSerializer(target).data)


class GeneratedAssetDetailView(DevOrAuthAssetPermissionMixin, APIView):
    def get(self, request, asset_id):
        viewer = _resolve_board_context_user(request)
        if viewer is None:
            return Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        asset = get_object_or_404(GeneratedAsset, pk=asset_id)
        if not _user_can_view_asset(viewer, asset):
            return Response({'detail': 'Kein Zugriff.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(GeneratedAssetSerializer(asset).data)


class GeneratedAssetRepairView(DevOrAuthAssetPermissionMixin, APIView):
    def post(self, request, asset_id):
        from .services.asset_pack_service import AssetPackGenerationService

        viewer = _resolve_board_context_user(request)
        if viewer is None:
            return Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        asset = get_object_or_404(GeneratedAsset, pk=asset_id)
        if not _user_can_view_asset(viewer, asset):
            return Response({'detail': 'Kein Zugriff.'}, status=status.HTTP_403_FORBIDDEN)
        if not asset.asset_pack:
            return Response(
                {'detail': 'Asset gehört keinem Pack — Repair nur über Pack-Repair möglich.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        enforce_positive_ai_credits_balance(viewer)
        service = AssetPackGenerationService(user=viewer, board=asset.asset_pack.board)
        try:
            service.repair_asset(asset)
        except Exception as exc:  # noqa: BLE001
            return Response({'detail': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response(GeneratedAssetSerializer(asset).data)


class GeneratedAssetMarkQualityExampleView(DevOrAuthAssetPermissionMixin, APIView):
    def post(self, request, asset_id):
        viewer = _resolve_board_context_user(request)
        if viewer is None:
            return Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        asset = get_object_or_404(GeneratedAsset, pk=asset_id)
        if not _user_can_view_asset(viewer, asset):
            return Response({'detail': 'Kein Zugriff.'}, status=status.HTTP_403_FORBIDDEN)
        flag = bool(request.data.get('value', True))
        asset.is_quality_example = flag
        asset.save(update_fields=['is_quality_example', 'updated_at'])
        return Response({'id': str(asset.id), 'is_quality_example': flag})


class GeneratedAssetMarkReusableView(DevOrAuthAssetPermissionMixin, APIView):
    def post(self, request, asset_id):
        viewer = _resolve_board_context_user(request)
        if viewer is None:
            return Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        asset = get_object_or_404(GeneratedAsset, pk=asset_id)
        if not _user_can_view_asset(viewer, asset):
            return Response({'detail': 'Kein Zugriff.'}, status=status.HTTP_403_FORBIDDEN)
        flag = bool(request.data.get('value', True))
        asset.is_reusable = flag
        asset.save(update_fields=['is_reusable', 'updated_at'])
        return Response({'id': str(asset.id), 'is_reusable': flag})
