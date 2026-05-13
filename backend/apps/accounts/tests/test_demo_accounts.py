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
        UserProfile.objects.filter(user=self.demo).update(
            is_demo=True,
            demo_must_set_own_password=False,
        )
        UserCreditBalance.objects.filter(user=self.demo).update(balance=5000)
        self.client = APIClient()
        self.client.force_authenticate(user=self.demo)

    def test_me_includes_demo_flag(self) -> None:
        r = self.client.get('/api/auth/me/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data.get('is_demo_account'))
        self.assertFalse(r.data.get('demo_must_set_own_password'))
        self.assertTrue(r.data.get('has_platform_access'))

    def test_me_demo_must_set_own_password_blocks_access(self) -> None:
        UserProfile.objects.filter(user=self.demo).update(demo_must_set_own_password=True)
        r = self.client.get('/api/auth/me/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data.get('demo_must_set_own_password'))
        self.assertFalse(r.data.get('has_platform_access'))

    def test_demo_set_own_password(self) -> None:
        UserProfile.objects.filter(user=self.demo).update(demo_must_set_own_password=True)
        r = self.client.post(
            '/api/auth/demo/set-own-password/',
            {
                'current_password': 'DemoInit123!',
                'new_password': 'PersonalDemo999!',
                'new_password_confirm': 'PersonalDemo999!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.demo.refresh_from_db()
        self.assertTrue(self.demo.check_password('PersonalDemo999!'))
        prof = UserProfile.objects.get(user=self.demo)
        self.assertTrue(prof.is_demo)
        self.assertFalse(prof.demo_must_set_own_password)
        r2 = self.client.get('/api/auth/me/')
        self.assertTrue(r2.data.get('has_platform_access'))

    def test_demo_set_own_password_rejects_non_demo(self) -> None:
        UserProfile.objects.filter(user=self.demo).update(is_demo=False, demo_must_set_own_password=False)
        r = self.client.post(
            '/api/auth/demo/set-own-password/',
            {
                'current_password': 'DemoInit123!',
                'new_password': 'PersonalDemo999!',
                'new_password_confirm': 'PersonalDemo999!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_demo_set_own_password_rejects_when_not_required(self) -> None:
        r = self.client.post(
            '/api/auth/demo/set-own-password/',
            {
                'current_password': 'DemoInit123!',
                'new_password': 'PersonalDemo999!',
                'new_password_confirm': 'PersonalDemo999!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_finalize_demo_account(self) -> None:
        r = self.client.post(
            '/api/auth/demo/finalize/',
            {
                'first_name': 'Pat',
                'last_name': 'Demo',
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
        self.assertEqual(self.demo.first_name, 'Pat')
        self.assertEqual(self.demo.last_name, 'Demo')
        self.assertTrue(self.demo.check_password('NewSecure456!'))
        self.assertFalse(UserProfile.objects.get(user=self.demo).is_demo)

    def test_finalize_requires_names(self) -> None:
        r = self.client.post(
            '/api/auth/demo/finalize/',
            {
                'first_name': '',
                'last_name': 'X',
                'new_email': 'converted@example.com',
                'new_password': 'NewSecure456!',
                'new_password_confirm': 'NewSecure456!',
                'current_password': 'DemoInit123!',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

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
                'first_name': 'R',
                'last_name': 'User',
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
