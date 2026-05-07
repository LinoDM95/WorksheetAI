from django.urls import path

from .backoffice_views import (
    BackofficeBoardApproveView,
    BackofficeBoardDestroyView,
    BackofficeBoardLibraryCommentDestroyView,
    BackofficeBoardPreviewView,
    BackofficeBoardRejectView,
    BackofficeBoardUnpublishView,
    BackofficePendingView,
    BackofficeWorksheetApproveView,
    BackofficeWorksheetDestroyView,
    BackofficeWorksheetPreviewView,
    BackofficeWorksheetRejectView,
    BackofficeWorksheetUnpublishView,
)
from .views import (
    CookieTokenObtainPairView,
    CookieTokenRefreshView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
)

urlpatterns = [
    path('register/', RegisterView.as_view()),
    path('login/', CookieTokenObtainPairView.as_view()),
    path('logout/', LogoutView.as_view()),
    path('token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('me/', MeView.as_view()),
    path('password-reset/', PasswordResetRequestView.as_view()),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view()),
    path('backoffice/pending/', BackofficePendingView.as_view()),
    path('backoffice/boards/<uuid:pk>/preview/', BackofficeBoardPreviewView.as_view()),
    path('backoffice/worksheets/<uuid:pk>/preview/', BackofficeWorksheetPreviewView.as_view()),
    path('backoffice/boards/<uuid:pk>/approve/', BackofficeBoardApproveView.as_view()),
    path('backoffice/boards/<uuid:pk>/reject/', BackofficeBoardRejectView.as_view()),
    path('backoffice/boards/<uuid:pk>/unpublish/', BackofficeBoardUnpublishView.as_view()),
    path(
        'backoffice/boards/<uuid:board_pk>/comments/<uuid:comment_pk>/',
        BackofficeBoardLibraryCommentDestroyView.as_view(),
    ),
    path('backoffice/boards/<uuid:pk>/', BackofficeBoardDestroyView.as_view()),
    path('backoffice/worksheets/<uuid:pk>/approve/', BackofficeWorksheetApproveView.as_view()),
    path('backoffice/worksheets/<uuid:pk>/reject/', BackofficeWorksheetRejectView.as_view()),
    path('backoffice/worksheets/<uuid:pk>/unpublish/', BackofficeWorksheetUnpublishView.as_view()),
    path('backoffice/worksheets/<uuid:pk>/', BackofficeWorksheetDestroyView.as_view()),
]
