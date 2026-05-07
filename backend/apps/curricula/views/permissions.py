"""Shared permission tuple for staff-only curricula endpoints."""
from __future__ import annotations

from rest_framework.permissions import IsAuthenticated

from apps.curricula.permissions import IsStaffUser

STAFF_CURRICULA_PERMS: list = [IsAuthenticated, IsStaffUser]
