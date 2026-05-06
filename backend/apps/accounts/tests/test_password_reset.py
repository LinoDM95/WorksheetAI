from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import TestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

User = get_user_model()


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    FRONTEND_PUBLIC_URL='http://frontend.test',
)
class PasswordResetTests(TestCase):
    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.user = User.objects.create_user(
            username='reset@example.com',
            email='reset@example.com',
            password='OldPass123!',
        )

    def test_request_sends_email_when_user_exists(self):
        r = self.client.post(
            '/api/auth/password-reset/',
            {'email': 'reset@example.com'},
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('reset@example.com', mail.outbox[0].to)
        self.assertIn('http://frontend.test/passwort/zuruecksetzen', mail.outbox[0].body)

    def test_request_does_not_send_email_for_unknown_address(self):
        r = self.client.post(
            '/api/auth/password-reset/',
            {'email': 'nobody@example.com'},
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirm_changes_password(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        r = self.client.post(
            '/api/auth/password-reset/confirm/',
            {
                'uid': uid,
                'token': token,
                'password': 'NewPass456!zz',
                'password_confirm': 'NewPass456!zz',
            },
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPass456!zz'))

    def test_confirm_rejects_bad_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        r = self.client.post(
            '/api/auth/password-reset/confirm/',
            {
                'uid': uid,
                'token': 'invalid',
                'password': 'NewPass456!zz',
                'password_confirm': 'NewPass456!zz',
            },
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 400)

    @override_settings(PASSWORD_RESET_MAX_PER_IP_PER_HOUR=2)
    def test_request_throttled_per_ip(self):
        for i in range(2):
            r = self.client.post(
                '/api/auth/password-reset/',
                {'email': f'u{i}@example.com'},
                content_type='application/json',
            )
            self.assertEqual(r.status_code, 200, i)
        r3 = self.client.post(
            '/api/auth/password-reset/',
            {'email': 'u9@example.com'},
            content_type='application/json',
        )
        self.assertEqual(r3.status_code, 429)
