"""Anonyme Schüler-„Präsenz“ pro share_token — nur Zählung, keine personenbezogenen Daten."""

from __future__ import annotations

import re
import threading
import time

from django.conf import settings
from django.core.cache import cache

PREFIX = 'board:stdpresence:v1'
STALE_SEC = 120
BUCKET_TTL_SEC = 180
MAX_CLIENT_ID_LEN = 128

_CLIENT_ID_RE = re.compile(r'^[a-zA-Z0-9._:-]{1,128}$')

_lock_guard = threading.Lock()
_bucket_locks: dict[str, threading.Lock] = {}


def _lock_for_share_key(cache_key: str) -> threading.Lock:
    with _lock_guard:
        lk = _bucket_locks.get(cache_key)
        if lk is None:
            lk = threading.Lock()
            _bucket_locks[cache_key] = lk
        return lk


def _uses_redis_cache() -> bool:
    backend = (settings.CACHES.get('default') or {}).get('BACKEND', '')
    return 'RedisCache' in backend


def _redis_hash_key(share_token: str) -> str:
    return f'{PREFIX}:h:{share_token}'


def _redis_decode(raw: object) -> str:
    if isinstance(raw, bytes):
        return raw.decode('utf-8', errors='replace')
    return str(raw)


def _redis_conn():
    from django_redis import get_redis_connection

    return get_redis_connection('default')


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


def _touch_redis(share_token: str, cid: str, now: float) -> None:
    conn = _redis_conn()
    hkey = _redis_hash_key(share_token)
    conn.hset(hkey, cid, str(now))
    conn.expire(hkey, BUCKET_TTL_SEC)


def _leave_redis(share_token: str, cid: str) -> None:
    conn = _redis_conn()
    hkey = _redis_hash_key(share_token)
    conn.hdel(hkey, cid)
    if conn.hlen(hkey) == 0:
        conn.delete(hkey)


def _count_redis(share_token: str, now: float) -> int:
    conn = _redis_conn()
    hkey = _redis_hash_key(share_token)
    mapping = conn.hgetall(hkey)
    if not mapping:
        return 0
    stale: list[str | bytes] = []
    n = 0
    for field, val in mapping.items():
        try:
            ts = float(_redis_decode(val))
        except (TypeError, ValueError):
            stale.append(field)
            continue
        if now - ts < STALE_SEC:
            n += 1
        else:
            stale.append(field)
    if stale:
        conn.hdel(hkey, *stale)
        if conn.hlen(hkey) == 0:
            conn.delete(hkey)
    return n


def touch(share_token: str, client_id: str) -> None:
    cid = _normalize_client_id(client_id)
    if not cid:
        return
    now = time.time()
    if _uses_redis_cache():
        _touch_redis(share_token, cid, now)
        return
    key = _cache_key(share_token)
    with _lock_for_share_key(key):
        raw = cache.get(key)
        data = _prune(raw, now) if isinstance(raw, dict) else {}
        data[cid] = now
        cache.set(key, data, BUCKET_TTL_SEC)


def leave(share_token: str, client_id: str) -> None:
    cid = _normalize_client_id(client_id)
    if not cid:
        return
    if _uses_redis_cache():
        _leave_redis(share_token, cid)
        return
    key = _cache_key(share_token)
    now = time.time()
    with _lock_for_share_key(key):
        raw = cache.get(key)
        data = _prune(raw, now) if isinstance(raw, dict) else {}
        data.pop(cid, None)
        if data:
            cache.set(key, data, BUCKET_TTL_SEC)
        else:
            cache.delete(key)


def count_connected(share_token: str) -> int:
    now = time.time()
    if _uses_redis_cache():
        return _count_redis(share_token, now)
    key = _cache_key(share_token)
    with _lock_for_share_key(key):
        raw = cache.get(key)
        data = _prune(raw, now) if isinstance(raw, dict) else {}
        if raw != data and data:
            cache.set(key, data, BUCKET_TTL_SEC)
        elif raw != data and not data:
            cache.delete(key)
        return len(data)
