"""Demo-Konto: API finalize, Zugriffsregeln, Profil-Flag."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import UserCreditBalance, UserProfile

User = get_user_model()


class DemoAccountApiTests(TestCase):
    def setUp(self) -> None:
        self.demo = User.objects.create_user(
            username='demo-u@demo.example.org',
            email='demo-u@demo.example.org',
            password='DemoInit123!',
        )
        UserProfile.objects.filter(user=self.demo).update(is_demo=True)
        UserCreditBalance.objects.filter(user=self.demo).update(balance=5000)
        self.client = APIClient()
        self.client.force_authenticate(user=self.demo)

    def test_me_includes_demo_flag(self) -> None:
        r = self.client.get('/api/auth/me/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data.get('is_demo_account'))
        self.assertFalse(r.data.get('demo_must_set_own_password'))
        self.assertTrue(r.data.get('has_platform_access'))

    def test_finalize_demo_account(self) -> None:
        r = self.client.post(
            '/api/auth/demo/finalize/',
            {
                'new_email': 'converted@example.com',
                'new_password': 'NewSecure456!',
                'new_password_confirm': 'NewSecure456!',
                'current_password': 'DemoInit123!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data.get('reauth_required'))
        self.demo.refresh_from_db()
        self.assertEqual(self.demo.email, 'converted@example.com')
        self.assertEqual(self.demo.username, 'converted@example.com')
        self.assertTrue(self.demo.check_password('NewSecure456!'))
        self.assertFalse(UserProfile.objects.get(user=self.demo).is_demo)

    def test_finalize_rejects_non_demo(self) -> None:
        regular = User.objects.create_user(
            username='reg@example.com',
            email='reg@example.com',
            password='RegPass123!',
        )
        self.assertFalse(UserProfile.objects.get(user=regular).is_demo)
        self.client.force_authenticate(user=regular)
        r = self.client.post(
            '/api/auth/demo/finalize/',
            {
                'new_email': 'other@example.com',
                'new_password': 'NewSecure456!',
                'new_password_confirm': 'NewSecure456!',
                'current_password': 'RegPass123!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_demo_change_password_blocked(self) -> None:
        r = self.client.post(
            '/api/auth/password/change/',
            {
                'current_password': 'DemoInit123!',
                'new_password': 'Xyz999999!',
                'new_password_confirm': 'Xyz999999!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_demo_change_email_blocked(self) -> None:
        r = self.client.post(
            '/api/auth/email/change/',
            {
                'new_email': 'x@example.com',
                'current_password': 'DemoInit123!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_demo_finalize_blocked_until_own_password_set(self) -> None:
        UserProfile.objects.filter(user=self.demo).update(demo_must_set_own_password=True)
        r = self.client.post(
            '/api/auth/demo/finalize/',
            {
                'new_email': 'converted@example.com',
                'new_password': 'NewSecure456!',
                'new_password_confirm': 'NewSecure456!',
                'current_password': 'DemoInit123!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(UserProfile.objects.get(user=self.demo).is_demo)

    def test_demo_set_own_password_clears_flag(self) -> None:
        UserProfile.objects.filter(user=self.demo).update(demo_must_set_own_password=True)
        r = self.client.post(
            '/api/auth/demo/set-own-password/',
            {
                'current_password': 'DemoInit123!',
                'new_password': 'ChosenByUser789!',
                'new_password_confirm': 'ChosenByUser789!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertFalse(UserProfile.objects.get(user=self.demo).demo_must_set_own_password)
        self.demo.refresh_from_db()
        self.assertTrue(self.demo.check_password('ChosenByUser789!'))

    def test_demo_set_own_password_rejected_when_not_demo(self) -> None:
        regular = User.objects.create_user(
            username='r2@example.com',
            email='r2@example.com',
            password='RegPass123!',
        )
        self.client.force_authenticate(user=regular)
        r = self.client.post(
            '/api/auth/demo/set-own-password/',
            {
                'current_password': 'RegPass123!',
                'new_password': 'Xyz999999!',
                'new_password_confirm': 'Xyz999999!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
