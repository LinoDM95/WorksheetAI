"""Stripe Checkout & Kundenportal (DRF)."""
from __future__ import annotations

import logging

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.services.credit_purchases import (
    build_stripe_line_items,
    get_active_credit_package,
    list_active_credit_packages,
    record_pending_purchase,
)
from apps.accounts.services.demo_accounts import profile_is_demo
from apps.accounts.services.stripe_billing import get_stripe_module, resolve_stripe_price_id_for_plan_slug
from apps.accounts.services.subscription import get_user_subscription

logger = logging.getLogger(__name__)

VALID_CHECKOUT_SLUGS = frozenset({'basic_5', 'starter_10', 'pro_20'})


class StripeCheckoutSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if profile_is_demo(request.user):
            return Response(
                {
                    'detail': (
                        'Demo-Konten können kein Abo abschließen. Übernimm zuerst dein Konto unter '
                        'Einstellungen (Abschnitt „Account übernehmen“). Danach kannst du einen '
                        'Plan wählen und bezahlen.'
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        plan_slug = (request.data.get('plan_slug') or '').strip()
        if plan_slug not in VALID_CHECKOUT_SLUGS:
            return Response({'detail': 'Ungültiger Plan.'}, status=status.HTTP_400_BAD_REQUEST)

        price_id = resolve_stripe_price_id_for_plan_slug(plan_slug)
        if not price_id:
            return Response(
                {'detail': 'Stripe-Preis nicht konfiguriert (STRIPE_PRICE_* / Admin-Price-ID).'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        stripe_mod, _ = get_stripe_module()
        if not stripe_mod:
            return Response(
                {'detail': 'Zahlungen nicht konfiguriert.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        frontend = str(getattr(settings, 'FRONTEND_PUBLIC_URL', '') or '').rstrip('/')
        if not frontend:
            frontend = 'http://localhost:5173'

        sub_row = get_user_subscription(request.user)
        cust_id = (sub_row.stripe_customer_id if sub_row else '') or ''

        checkout_kwargs: dict = {
            'mode': 'subscription',
            'line_items': [{'price': price_id, 'quantity': 1}],
            'success_url': f'{frontend}/app/abonnement?checkout=success',
            'cancel_url': f'{frontend}/app/abonnement?checkout=canceled',
            'metadata': {'user_id': str(request.user.pk), 'plan_slug': plan_slug},
            'subscription_data': {
                'metadata': {'user_id': str(request.user.pk), 'plan_slug': plan_slug},
            },
        }
        if cust_id:
            checkout_kwargs['customer'] = cust_id
        else:
            checkout_kwargs['customer_email'] = request.user.email

        try:
            session = stripe_mod.checkout.Session.create(**checkout_kwargs)
        except Exception:
            logger.exception('Stripe Checkout Session create failed')
            return Response(
                {'detail': 'Checkout konnte nicht gestartet werden.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        url = getattr(session, 'url', None) or (session.get('url') if isinstance(session, dict) else None)
        if not url:
            return Response(
                {'detail': 'Keine Checkout-URL von Stripe.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({'url': url})


class StripeBillingPortalView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if profile_is_demo(request.user):
            return Response(
                {'detail': 'Das Kundenportal steht Demo-Konten nicht zur Verfügung.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        stripe_mod, _ = get_stripe_module()
        if not stripe_mod:
            return Response(
                {'detail': 'Zahlungen nicht konfiguriert.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        sub_row = get_user_subscription(request.user)
        cust_id = (sub_row.stripe_customer_id if sub_row else '') or ''
        if not cust_id:
            return Response(
                {'detail': 'Kein Stripe-Kundenkonto. Bitte zuerst ein Abo abschließen.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        frontend = str(getattr(settings, 'FRONTEND_PUBLIC_URL', '') or '').rstrip('/')
        if not frontend:
            frontend = 'http://localhost:5173'

        return_path = (request.data.get('return_path') or '/app/abonnement').strip()
        if not return_path.startswith('/') or '\n' in return_path or '\r' in return_path or '..' in return_path:
            return_path = '/app/abonnement'

        try:
            session = stripe_mod.billing_portal.Session.create(
                customer=cust_id,
                return_url=f'{frontend}{return_path}',
            )
        except Exception:
            logger.exception('Stripe Billing Portal Session create failed')
            return Response(
                {'detail': 'Kundenportal konnte nicht geöffnet werden.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        url = getattr(session, 'url', None) or (session.get('url') if isinstance(session, dict) else None)
        if not url:
            return Response(
                {'detail': 'Keine Portal-URL von Stripe.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({'url': url})


class CreditPackageListView(APIView):
    """Liste aktiver Credit-Pakete für die Frontend-Anzeige (öffentlich nutzbar)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return Response({'packages': list_active_credit_packages()})


class StripeCreditCheckoutView(APIView):
    """Einmalkauf eines Credit-Pakets (Stripe ``mode=payment``)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if profile_is_demo(request.user):
            return Response(
                {
                    'detail': (
                        'Demo-Konten können keine Zahlungen auslösen. Übernimm zuerst dein Konto in '
                        'den Einstellungen — danach kannst du Credits kaufen.'
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        slug = (request.data.get('package_slug') or '').strip()
        package = get_active_credit_package(slug)
        if package is None:
            return Response({'detail': 'Ungültiges Paket.'}, status=status.HTTP_400_BAD_REQUEST)

        stripe_mod, _ = get_stripe_module()
        if not stripe_mod:
            return Response(
                {'detail': 'Zahlungen nicht konfiguriert.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        frontend = str(getattr(settings, 'FRONTEND_PUBLIC_URL', '') or '').rstrip('/')
        if not frontend:
            frontend = 'http://localhost:5173'

        sub_row = get_user_subscription(request.user)
        cust_id = (sub_row.stripe_customer_id if sub_row else '') or ''

        checkout_kwargs: dict = {
            'mode': 'payment',
            'line_items': build_stripe_line_items(package),
            'success_url': f'{frontend}/app/credits?purchase=success',
            'cancel_url': f'{frontend}/app/credits?purchase=canceled',
            'metadata': {
                'purpose': 'credit_purchase',
                'user_id': str(request.user.pk),
                'package_slug': package.slug,
                'credits': str(int(package.credits)),
            },
            'payment_intent_data': {
                'metadata': {
                    'purpose': 'credit_purchase',
                    'user_id': str(request.user.pk),
                    'package_slug': package.slug,
                    'credits': str(int(package.credits)),
                },
            },
        }
        if cust_id:
            checkout_kwargs['customer'] = cust_id
        else:
            checkout_kwargs['customer_email'] = request.user.email

        try:
            session = stripe_mod.checkout.Session.create(**checkout_kwargs)
        except Exception:
            logger.exception('Stripe Credit Checkout Session create failed')
            return Response(
                {'detail': 'Checkout konnte nicht gestartet werden.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        url = getattr(session, 'url', None) or (session.get('url') if isinstance(session, dict) else None)
        session_id = getattr(session, 'id', None) or (session.get('id') if isinstance(session, dict) else None)
        if not url:
            return Response(
                {'detail': 'Keine Checkout-URL von Stripe.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if session_id:
            try:
                record_pending_purchase(user=request.user, package=package, stripe_session_id=str(session_id))
            except Exception:
                logger.exception('record_pending_purchase failed (session=%s)', session_id)

        return Response({'url': url})
