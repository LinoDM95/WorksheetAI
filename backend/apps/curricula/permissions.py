from rest_framework.permissions import BasePermission


class IsStaffUser(BasePermission):
    """Nur angemeldete Nutzer:innen mit Django-``is_staff`` (administrativer Zugang)."""

    def has_permission(self, request, view) -> bool:
        u = request.user
        return bool(u and u.is_authenticated and u.is_staff)
