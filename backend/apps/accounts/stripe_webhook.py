"""Stripe Webhook (roher Body, Signaturprüfung)."""
from __future__ import annotations

import logging

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.accounts.services.credit_purchases import apply_credit_purchase_from_session
from apps.accounts.services.stripe_billing import (
    apply_user_subscription_from_stripe,
    get_stripe_module,
    grant_invoice_credits_if_paid,
)

logger = logging.getLogger(__name__)


def _stripe_obj_to_dict(obj) -> dict:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, 'to_dict'):
        return obj.to_dict()
    try:
        return dict(obj)
    except TypeError:
        return {}


def _resolve_user_id_from_subscription(stripe_sub: dict, fallback_customer_id: str = '') -> int | None:
    meta = stripe_sub.get('metadata') or {}
    uid = meta.get('user_id')
    if uid:
        try:
            return int(uid)
        except (TypeError, ValueError):
            pass
    from apps.accounts.models import UserSubscription

    sub_id = str(stripe_sub.get('id') or '')
    if sub_id:
        row = UserSubscription.objects.filter(stripe_subscription_id=sub_id).first()
        if row:
            return int(row.user_id)
    cust = str(stripe_sub.get('customer') or fallback_customer_id or '')
    if cust:
        row = UserSubscription.objects.filter(stripe_customer_id=cust).first()
        if row:
            return int(row.user_id)
    return None


@csrf_exempt
@require_POST
def stripe_webhook_view(request):
    stripe_mod, _ = get_stripe_module()
    secret = getattr(settings, 'STRIPE_WEBHOOK_SECRET', '') or ''
    if not stripe_mod or not secret:
        logger.warning('Stripe webhook called but STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing')
        return HttpResponse(status=503)

    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    if not sig_header:
        return HttpResponse(status=400)

    try:
        event = stripe_mod.Webhook.construct_event(payload, sig_header, secret)
    except ValueError:
        return HttpResponse(status=400)
    except Exception as exc:
        if type(exc).__name__ != 'SignatureVerificationError':
            logger.warning('Stripe webhook construct_event: %s', exc)
        return HttpResponse(status=400)

    etype = event.get('type')
    data_obj = (event.get('data') or {}).get('object') or {}

    try:
        if etype == 'checkout.session.completed':
            sess = data_obj
            mode = str(sess.get('mode') or '')
            if mode == 'payment':
                apply_credit_purchase_from_session(sess)
                return HttpResponse(status=200)
            if mode != 'subscription':
                return HttpResponse(status=200)
            uid_raw = (sess.get('metadata') or {}).get('user_id')
            if not uid_raw:
                return HttpResponse(status=200)
            uid = int(uid_raw)
            sub_id = sess.get('subscription')
            cust_id = sess.get('customer')
            if not sub_id or not cust_id:
                return HttpResponse(status=200)
            sub_resource = stripe_mod.Subscription.retrieve(str(sub_id))
            sub_dict = _stripe_obj_to_dict(sub_resource)
            apply_user_subscription_from_stripe(
                uid,
                stripe_customer_id=str(cust_id),
                stripe_subscription_id=str(sub_id),
                stripe_subscription_obj=sub_dict,
            )

        elif etype in ('customer.subscription.updated', 'customer.subscription.deleted'):
            sub_dict = data_obj if isinstance(data_obj, dict) else _stripe_obj_to_dict(data_obj)
            cust_id = str(sub_dict.get('customer') or '')
            sub_id = str(sub_dict.get('id') or '')
            uid = _resolve_user_id_from_subscription(sub_dict, cust_id)
            if uid is None:
                logger.warning('Stripe %s: could not resolve user (sub %s)', etype, sub_id)
                return HttpResponse(status=200)
            apply_user_subscription_from_stripe(
                uid,
                stripe_customer_id=cust_id,
                stripe_subscription_id=sub_id,
                stripe_subscription_obj=sub_dict,
            )

        elif etype == 'invoice.paid':
            inv = data_obj if isinstance(data_obj, dict) else _stripe_obj_to_dict(data_obj)
            grant_invoice_credits_if_paid(inv)

    except Exception:
        logger.exception('Stripe webhook handler failed for %s', etype)
        return HttpResponse(status=500)

    return HttpResponse(status=200)
