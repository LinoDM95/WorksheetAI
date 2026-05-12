from django.contrib.auth import get_user_model
from django.test import TestCase

User = get_user_model()


class AccountSettingsApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='u@example.com',
            email='u@example.com',
            password='OldPass123!',
        )

    def _login(self):
        r = self.client.post(
            '/api/auth/login/',
            {'username': 'u@example.com', 'password': 'OldPass123!'},
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 200)

    def test_change_password_requires_auth(self):
        r = self.client.post(
            '/api/auth/password/change/',
            {
                'current_password': 'OldPass123!',
                'new_password': 'NewPass456!',
                'new_password_confirm': 'NewPass456!',
            },
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 401)

    def test_change_password_wrong_current(self):
        self._login()
        r = self.client.post(
            '/api/auth/password/change/',
            {
                'current_password': 'wrong',
                'new_password': 'NewPass456!',
                'new_password_confirm': 'NewPass456!',
            },
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 400)
        body = r.json()
        self.assertIn('current_password', body)

    def test_change_password_success(self):
        self._login()
        r = self.client.post(
            '/api/auth/password/change/',
            {
                'current_password': 'OldPass123!',
                'new_password': 'NewPass456!',
                'new_password_confirm': 'NewPass456!',
            },
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPass456!'))

    def test_change_email_success(self):
        self._login()
        r = self.client.post(
            '/api/auth/email/change/',
            {
                'new_email': 'new@example.com',
                'current_password': 'OldPass123!',
            },
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['email'], 'new@example.com')
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'new@example.com')
        self.assertEqual(self.user.username, 'new@example.com')

    def test_change_email_duplicate(self):
        User.objects.create_user(
            username='taken@example.com',
            email='taken@example.com',
            password='OtherPass123!',
        )
        self._login()
        r = self.client.post(
            '/api/auth/email/change/',
            {
                'new_email': 'taken@example.com',
                'current_password': 'OldPass123!',
            },
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn('new_email', r.json())
