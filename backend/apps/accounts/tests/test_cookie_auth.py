from django.contrib.auth import get_user_model
from django.test import TestCase

User = get_user_model()


class CookieAuthTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='t@example.com',
            email='t@example.com',
            password='TestPass123!',
        )

    def test_login_sets_http_only_cookies(self):
        r = self.client.post(
            '/api/auth/login/',
            {'username': 't@example.com', 'password': 'TestPass123!'},
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertIn('access', r.cookies)
        self.assertIn('refresh', r.cookies)
        self.assertTrue(r.cookies['access']['httponly'])

    def test_me_uses_access_cookie(self):
        r1 = self.client.post(
            '/api/auth/login/',
            {'username': 't@example.com', 'password': 'TestPass123!'},
            content_type='application/json',
        )
        self.assertEqual(r1.status_code, 200)
        r2 = self.client.get('/api/auth/me/')
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()['email'], 't@example.com')

    def test_logout_clears_cookies(self):
        self.client.post(
            '/api/auth/login/',
            {'username': 't@example.com', 'password': 'TestPass123!'},
            content_type='application/json',
        )
        r_out = self.client.post('/api/auth/logout/', {}, content_type='application/json')
        self.assertEqual(r_out.status_code, 200)
        r_me = self.client.get('/api/auth/me/')
        self.assertEqual(r_me.status_code, 401)
