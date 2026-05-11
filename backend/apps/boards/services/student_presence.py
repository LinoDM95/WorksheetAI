"""Anonyme Schüler-„Präsenz“ pro share_token — nur Zählung, keine personenbezogenen Daten."""

from __future__ import annotations

import re
import time

from django.core.cache import cache

PREFIX = 'board:stdpresence:v1'
STALE_SEC = 90
BUCKET_TTL_SEC = 180
MAX_CLIENT_ID_LEN = 128

_CLIENT_ID_RE = re.compile(r'^[a-zA-Z0-9._:-]{1,128}$')


def _cache_key(share_token: str) -> str:
    return f'{PREFIX}:{share_token}'


def _normalize_client_id(raw: object) -> str | None:
    if raw is None or not isinstance(raw, str):
        return None
    s = raw.strip()
    if len(s) > MAX_CLIENT_ID_LEN:
        return None
    if not _CLIENT_ID_RE.match(s):
        return None
    return s


def _prune(data: dict, now: float) -> dict:
    out: dict[str, float] = {}
    for k, v in data.items():
        if not isinstance(k, str):
            continue
        try:
            ts = float(v)
        except (TypeError, ValueError):
            continue
        if now - ts < STALE_SEC:
            out[k] = ts
    return out


def touch(share_token: str, client_id: str) -> None:
    cid = _normalize_client_id(client_id)
    if not cid:
        return
    key = _cache_key(share_token)
    now = time.time()
    raw = cache.get(key)
    data = _prune(raw, now) if isinstance(raw, dict) else {}
    data[cid] = now
    cache.set(key, data, BUCKET_TTL_SEC)


def leave(share_token: str, client_id: str) -> None:
    cid = _normalize_client_id(client_id)
    if not cid:
        return
    key = _cache_key(share_token)
    now = time.time()
    raw = cache.get(key)
    data = _prune(raw, now) if isinstance(raw, dict) else {}
    data.pop(cid, None)
    if data:
        cache.set(key, data, BUCKET_TTL_SEC)
    else:
        cache.delete(key)


def count_connected(share_token: str) -> int:
    key = _cache_key(share_token)
    now = time.time()
    raw = cache.get(key)
    data = _prune(raw, now) if isinstance(raw, dict) else {}
    if raw != data and data:
        cache.set(key, data, BUCKET_TTL_SEC)
    elif raw != data and not data:
        cache.delete(key)
    return len(data)
