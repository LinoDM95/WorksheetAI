"""Gemini-Modell-Fallback (eine zentrale Stelle via ``GEMINI_MODEL_FALLBACK``).

Wenn das gewünschte Modell (z. B. Preview) für den API-Key/Endpoint nicht
existiert, wird einmalig auf das Fallback-Modell gewechselt — nicht bei Quotas,
Timeouts oder DEADLINE_EXCEEDED.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def expand_gemini_model_chain(primary: str | None) -> list[str]:
    """Primärmodell plus optionales Fallback aus Django-Settings (dedupliziert)."""
    from django.conf import settings

    p = (primary or '').strip()
    if not p:
        p = str(getattr(settings, 'GEMINI_MODEL', '') or 'gemini-2.5-pro').strip()
    fb = (getattr(settings, 'GEMINI_MODEL_FALLBACK', None) or '').strip()
    chain = [p]
    if fb and fb != p:
        chain.append(fb)
    return chain


def _deadline_exceeded(exc: BaseException) -> bool:
    try:
        from google.genai import errors as genai_errors
    except ImportError:
        genai_errors = None  # type: ignore
    if genai_errors and isinstance(exc, genai_errors.APIError):
        st = (getattr(exc, 'status', None) or '') or ''
        msg = (getattr(exc, 'message', None) or '') or ''
        blob = f'{st} {msg}'.upper()
        if st == 'DEADLINE_EXCEEDED' or 'DEADLINE_EXCEEDED' in blob:
            return True
    s = str(exc).upper()
    return 'DEADLINE_EXCEEDED' in s or ('504' in str(exc) and 'DEADLINE' in s)


def _quota_or_rate_limited(exc: BaseException) -> bool:
    try:
        from google.genai import errors as genai_errors
    except ImportError:
        genai_errors = None  # type: ignore
    if genai_errors and isinstance(exc, genai_errors.APIError):
        st = (getattr(exc, 'status', None) or '') or ''
        if st in ('RESOURCE_EXHAUSTED', 'UNAVAILABLE'):
            return True
        code = getattr(exc, 'code', None)
        if code == 429:
            return True
    blob = str(exc).upper()
    return 'RESOURCE_EXHAUSTED' in blob or '429' in blob


def is_gemini_model_availability_error(exc: BaseException) -> bool:
    """True nur wenn ein Wechsel auf ``GEMINI_MODEL_FALLBACK`` sinnvoll sein kann."""
    if _deadline_exceeded(exc) or _quota_or_rate_limited(exc):
        return False

    try:
        from google.genai import errors as genai_errors
    except ImportError:
        genai_errors = None  # type: ignore

    if genai_errors and isinstance(exc, genai_errors.APIError):
        st = (getattr(exc, 'status', None) or '').upper()
        code = getattr(exc, 'code', None)
        if st == 'NOT_FOUND' or code == 404:
            return True
        if st == 'INVALID_ARGUMENT':
            raw = f'{(getattr(exc, "message", None) or "")} {exc.details}'.lower()
            if 'model' in raw and any(
                x in raw for x in ('not found', 'not supported', 'does not exist', 'invalid name', 'unknown model')
            ):
                return True
            return False
        if st == 'FAILED_PRECONDITION' and 'model' in str(exc).lower():
            return True

    blob = str(exc).upper()
    if 'NOT_FOUND' in blob and ('MODEL' in blob or 'MODELS/' in blob):
        return True
    if 'INVALID_ARGUMENT' in blob and 'MODEL' in blob:
        return True
    return False


def generate_content_first_resolved_model(
    client: Any,
    *,
    primary_model: str,
    contents: Any,
    config: Any,
) -> tuple[Any, str]:
    """Ruft ``client.models.generate_content`` mit Fallback-Kette auf.

    Returns
    -------
    (response, resolved_model_id)
    """
    chain = expand_gemini_model_chain(primary_model)
    last: BaseException | None = None
    for idx, model_id in enumerate(chain):
        try:
            resp = client.models.generate_content(model=model_id, contents=contents, config=config)
            if idx > 0:
                logger.warning(
                    'Gemini: Primärmodell %s nicht nutzbar — erfolgreich mit Fallback %s.',
                    chain[0],
                    model_id,
                )
            return resp, model_id
        except BaseException as exc:
            last = exc
            if idx >= len(chain) - 1 or not is_gemini_model_availability_error(exc):
                raise
            logger.warning(
                'Gemini Modell %s nicht verfügbar (%s), versuche Fallback %s',
                model_id,
                exc,
                chain[idx + 1],
            )
    assert last is not None
    raise last
