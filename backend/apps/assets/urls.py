from django.urls import path

from . import views


urlpatterns = [
    path('packs/', views.AssetPackListView.as_view(), name='asset-pack-list'),
    path('packs/<uuid:pack_id>/', views.AssetPackDetailView.as_view(), name='asset-pack-detail'),
    path('packs/<uuid:pack_id>/repair/', views.AssetPackRepairView.as_view(), name='asset-pack-repair'),
    path(
        'packs/<uuid:pack_id>/select-variant/',
        views.AssetPackSelectVariantView.as_view(),
        name='asset-pack-select-variant',
    ),
    path('<uuid:asset_id>/', views.GeneratedAssetDetailView.as_view(), name='asset-detail'),
    path('<uuid:asset_id>/repair/', views.GeneratedAssetRepairView.as_view(), name='asset-repair'),
    path(
        '<uuid:asset_id>/mark-quality-example/',
        views.GeneratedAssetMarkQualityExampleView.as_view(),
        name='asset-mark-quality-example',
    ),
    path(
        '<uuid:asset_id>/mark-reusable/',
        views.GeneratedAssetMarkReusableView.as_view(),
        name='asset-mark-reusable',
    ),
]
