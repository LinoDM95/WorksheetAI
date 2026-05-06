"""Laufzeit-Messung: Tokenzahl + Kostenschätzung pro KI-Aufruf (alle Pipelines).

:func:`generation_meter_context` aktiviert ein :class:`PipelineAIMeter` per
:class:`contextvars.ContextVar`. Provider delegieren echte Usage-Werte über
:func:`route_provider_usage` — mit aktivem Meter → Sammeln; ohne Meter →
``provider._pending_ai_usage_log`` für den :class:`SmartboardAIModelRouter`
oder späteres ``flush_logs_to_db``.

Kosten sind **Schätzungen** über ``settings.AI_*_PRICE_*`` (USD je 1M Tokens).
Bei **Gemini ohne „flash“** (Pro/Preview/Gemini‑3-Pfad): über ``AI_GEMINI_PROMPT_TOKEN_THRESHOLD_LONG_CONTEXT``
(z. B. 200 000) Umschalten auf ``AI_GEMINI_LONG_CONTEXT_*`` (Google: höhere $/1M bei großen Prompts).
**Gemini-Thinking** (``thoughts_token_count``) wird standardmäßig wie **Output-Tokens** mit abgerechnet
(Kostenbasis identisch zu Output), sofern nicht ``AI_GEMINI_EXCLUDE_THINKING_FROM_BILLING`` gesetzt ist;
``AI_GEMINI_COUNT_THINKING_TOKENS_AS_OUTPUT=False`` (Legacy) schließt Thinking ebenfalls aus.
**Claude Prompt-Cache** (``cache_read`` / ``cache_creation``) wird zur **Input-Token-Summe** für die $/1M-Rechnung addiert.
Fehlen passende Modellpreise, greifen ``AI_FALLBACK_*`` (Default in ``settings``).
Am Ende kann ``flush_logs_to_db`` über ``apps.accounts.services.credits`` die
Nutzer-Credits abbuchen (USD→EUR via ``AI_COST_USD_TO_EUR``, dann Credits).
``generation_meter_context`` flushed verbleibende Einträge beim Verlassen automatisch (verhindert vergessene Abrechnung).
"""
from __future__ import annotations

import contextvars
import logging
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Iterator

from django.conf import settings

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser

logger = logging.getLogger(__name__)


_active: contextvars.ContextVar['PipelineAIMeter | None'] = contextvars.ContextVar(
    'pipeline_ai_meter_active',
    default=None,
)


def _fprice(val) -> float | None:
    if val is None:
        return None
    try:
        v = float(val)
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None


def _price_per_mtok(model_hint: str) -> tuple[float | None, float | None]:
    """Liefert (input$/1MTok, output$/1MTok) anhand Modell-ID und Settings."""
    mh = (model_hint or '').lower()

    if 'claude' in mh or 'anthropic' in mh:
        return (
            _fprice(getattr(settings, 'AI_CLAUDE_INPUT_PRICE_PER_MILLION_USD', None)),
            _fprice(getattr(settings, 'AI_CLAUDE_OUTPUT_PRICE_PER_MILLION_USD', None)),
        )

    if 'gemini' not in mh and 'google' not in mh:
        return None, None

    flash_in = _fprice(getattr(settings, 'AI_GEMINI_FLASH_INPUT_PRICE_PER_MILLION_USD', None))
    flash_out = _fprice(getattr(settings, 'AI_GEMINI_FLASH_OUTPUT_PRICE_PER_MILLION_USD', None))
    lite_in = _fprice(getattr(settings, 'AI_GEMINI_FLASH_LITE_INPUT_PRICE_PER_MILLION_USD', None))
    lite_out = _fprice(getattr(settings, 'AI_GEMINI_FLASH_LITE_OUTPUT_PRICE_PER_MILLION_USD', None))
    preview_in = _fprice(getattr(settings, 'AI_GEMINI_PREVIEW_INPUT_PRICE_PER_MILLION_USD', None))
    preview_out = _fprice(getattr(settings, 'AI_GEMINI_PREVIEW_OUTPUT_PRICE_PER_MILLION_USD', None))
    p25_in = _fprice(getattr(settings, 'AI_GEMINI_25_PRO_INPUT_PRICE_PER_MILLION_USD', None))
    p25_out = _fprice(getattr(settings, 'AI_GEMINI_25_PRO_OUTPUT_PRICE_PER_MILLION_USD', None))
    pro_in = _fprice(getattr(settings, 'AI_GEMINI_PRO_INPUT_PRICE_PER_MILLION_USD', None))
    pro_out = _fprice(getattr(settings, 'AI_GEMINI_PRO_OUTPUT_PRICE_PER_MILLION_USD', None))

    if 'flash-lite' in mh or ('lite' in mh and 'flash' in mh):
        return (lite_in or flash_in, lite_out or flash_out)
    if 'flash' in mh:
        return (flash_in, flash_out)
    if 'preview' in mh or 'gemini-3' in mh:
        return (preview_in or p25_in or pro_in, preview_out or p25_out or pro_out)
    if '2.5' in mh and 'pro' in mh:
        return (p25_in or pro_in, p25_out or pro_out)
    return (pro_in, pro_out)


def _gemini_non_flash_model(model_hint: str) -> bool:
    mh = (model_hint or '').lower()
    if 'gemini' not in mh and 'google' not in mh:
        return False
    if 'embedding' in mh:
        return False
    return 'flash' not in mh


def _effective_usd_per_mtok(model_hint: str, *, input_tokens: int = 0) -> tuple[float | None, float | None]:
    """Modellspezifische USD/1M; Gemini-Pro-Pfad optional Long-Context-Tarif; Lücken mit AI_FALLBACK_*."""
    pi, po = _price_per_mtok(model_hint)
    if _gemini_non_flash_model(model_hint):
        thresh = max(0, int(getattr(settings, 'AI_GEMINI_PROMPT_TOKEN_THRESHOLD_LONG_CONTEXT', 200_000) or 0))
        if thresh > 0 and max(0, input_tokens) > thresh:
            long_in = _fprice(getattr(settings, 'AI_GEMINI_LONG_CONTEXT_INPUT_PRICE_PER_MILLION_USD', None))
            long_out = _fprice(getattr(settings, 'AI_GEMINI_LONG_CONTEXT_OUTPUT_PRICE_PER_MILLION_USD', None))
            if long_in is not None:
                pi = long_in
            if long_out is not None:
                po = long_out

    fi = _fprice(getattr(settings, 'AI_FALLBACK_INPUT_PRICE_PER_MILLION_USD', None))
    fo = _fprice(getattr(settings, 'AI_FALLBACK_OUTPUT_PRICE_PER_MILLION_USD', None))
    return (pi if pi is not None else fi, po if po is not None else fo)


def _pricing_metadata_note(
    *,
    model_name: str,
    cents: int,
    input_tokens: int,
    output_tokens: int,
) -> str | None:
    pi0, po0 = _price_per_mtok(model_name)
    eff_pi, eff_po = _effective_usd_per_mtok(model_name, input_tokens=input_tokens)
    if max(0, input_tokens) == 0 and max(0, output_tokens) == 0:
        return None
    if cents == 0 and (eff_pi is None or eff_po is None):
        return 'no_usd_estimate_all_prices_missing'
    if cents > 0 and (pi0 is None or po0 is None):
        return 'fallback_usd_per_mtok'
    return None


def estimate_cost_cents(
    *,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> int:
    pi, po = _effective_usd_per_mtok(model, input_tokens=input_tokens)
    if pi is None or po is None:
        return 0
    usd = (max(0, input_tokens) * pi / 1_000_000) + (max(0, output_tokens) * po / 1_000_000)
    return max(0, int(round(usd * 100)))


def parse_gemini_usage(resp: Any) -> tuple[int, int, dict[str, Any]]:
    um = getattr(resp, 'usage_metadata', None)
    if um is None:
        return 0, 0, {}
    inp_raw = getattr(um, 'prompt_token_count', None)
    out_raw = getattr(um, 'candidates_token_count', None)
    if inp_raw is None:
        inp_raw = getattr(um, 'input_tokens', None) or 0
    else:
        inp_raw = int(inp_raw)
    if out_raw is None:
        out_raw = getattr(um, 'output_tokens', None) or 0
    else:
        out_raw = int(out_raw)
    inp, out = int(inp_raw), int(out_raw)
    extras: dict[str, Any] = {}
    for attr in (
        'total_token_count',
        'thoughts_token_count',
        'cached_content_token_count',
        'tool_use_prompt_token_count',
    ):
        v = getattr(um, attr, None)
        if v is not None:
            extras[attr] = int(v)
    _merge_gemini_thought_aliases(um, extras)
    return inp, out, extras


def _merge_gemini_thought_aliases(um: Any, extras: dict[str, Any]) -> None:
    if extras.get('thoughts_token_count'):
        return
    for attr in ('thinking_tokens', 'reasoning_tokens', 'thinking_token_count'):
        v = getattr(um, attr, None)
        if v is not None:
            extras['thoughts_token_count'] = int(v)
            return


def parse_claude_usage(message: Any) -> tuple[int, int, dict[str, Any]]:
    u = getattr(message, 'usage', None)
    if u is None:
        return 0, 0, {}
    inp = int(getattr(u, 'input_tokens', None) or 0)
    out = int(getattr(u, 'output_tokens', None) or 0)
    extras: dict[str, Any] = {}
    for attr in ('cache_creation_input_tokens', 'cache_read_input_tokens'):
        v = getattr(u, attr, None)
        if v is not None:
            extras[attr] = int(v)
    return inp, out, extras


PRINT_PREFIX = '[AIUsage]'


def _gemini_thinking_tokens_from_extras(extras: dict[str, Any] | None) -> int:
    if not extras:
        return 0
    t = extras.get('thoughts_token_count')
    if t is None:
        return 0
    return max(0, int(t))


def _exclude_gemini_thinking_from_billing() -> bool:
    if getattr(settings, 'AI_GEMINI_EXCLUDE_THINKING_FROM_BILLING', False):
        return True
    return not getattr(settings, 'AI_GEMINI_COUNT_THINKING_TOKENS_AS_OUTPUT', True)


def _billable_gemini_output(out: int, extras: dict[str, Any] | None) -> int:
    thinking = _gemini_thinking_tokens_from_extras(extras)
    if thinking <= 0 or _exclude_gemini_thinking_from_billing():
        return out
    return out + thinking


def _billable_claude_input(inp: int, extras: dict[str, Any] | None) -> int:
    """Prompt + Prompt-Cache am effektiven Input-Tarif (gleicher $/MTok wie ``input_tokens``)."""
    if not extras:
        return inp
    read = int(extras.get('cache_read_input_tokens') or 0)
    create = int(extras.get('cache_creation_input_tokens') or 0)
    return max(0, int(inp)) + max(0, read) + max(0, create)


def log_standalone_gemini_usage(
    *,
    resp: Any,
    model: str,
    step_type: str,
    user: Any,
    board=None,
    fallback_char_source: str = '',
    metadata_extra: dict[str, Any] | None = None,
) -> None:
    """Direkte ``google.genai``-Aufrufe — gleiche Token-/Preislogik wie der Worksheet-Provider."""
    from apps.boards.models import AIUsageLog

    inp, out, ex = parse_gemini_usage(resp)
    if inp == 0 and out == 0 and fallback_char_source:
        inp = max(0, int(len(fallback_char_source) / 4))
    bill_out = _billable_gemini_output(out, ex)
    cents = estimate_cost_cents(
        provider='gemini',
        model=model,
        input_tokens=inp,
        output_tokens=bill_out,
    )
    md: dict[str, Any] = {
        **(metadata_extra or {}),
        **ex,
        'provider': 'gemini',
        'api_output_tokens': out,
        'pricing_model_key': model,
    }
    if ex.get('thoughts_token_count'):
        md['thinking_tokens_reported'] = ex['thoughts_token_count']
    if bill_out != out:
        md['output_tokens_billed_for_cost'] = bill_out
    note = _pricing_metadata_note(model_name=model, cents=cents, input_tokens=inp, output_tokens=bill_out)
    if note:
        md['pricing_note'] = note

    allowed = {c[0] for c in AIUsageLog.STEP_TYPE_CHOICES}
    db_step = step_type if step_type in allowed else 'risk'

    meter = _active.get()
    if meter is not None:
        meter.record(
            step_type=db_step[:40],
            provider='gemini',
            model_name=model,
            input_tokens=inp,
            output_tokens=out,
            success=True,
            metadata=md,
            estimated_cost_override_cents=cents,
        )
        return

    AIUsageLog.objects.create(
        user=user,
        board=board,
        step_type=db_step[:40],
        model_name=model[:100],
        input_tokens=max(0, int(inp)),
        output_tokens=max(0, int(out)),
        estimated_cost_cents=max(0, int(cents)),
        success=True,
        metadata=md,
    )
    from apps.accounts.services.credits import charge_ai_usage_usd_cents

    charge_ai_usage_usd_cents(user, int(cents))
    cents_s = f'~${cents / 100:.4f}' if cents else '?'
    print(
        f'{PRINT_PREFIX} {db_step} provider=gemini model={model} in={inp} out={out} est={cents_s}',
        flush=True,
    )


def route_provider_usage(
    *,
    provider_self: Any,
    step_type: str,
    provider_label: str,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    success: bool = True,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Schreibt in aktiven Meter **oder** setzt ``_pending_ai_usage_log`` auf der Provider-Instanz."""
    extras = metadata or {}
    pl = (provider_label or '').lower()
    raw_in = max(0, int(input_tokens))
    raw_out = max(0, int(output_tokens))
    bill_in = raw_in
    bill_out = raw_out
    if pl == 'gemini':
        bill_out = _billable_gemini_output(output_tokens, extras)
    elif pl == 'claude':
        bill_in = _billable_claude_input(input_tokens, extras)

    cents = estimate_cost_cents(
        provider=provider_label,
        model=model_name,
        input_tokens=bill_in,
        output_tokens=bill_out,
    )
    md = {
        **extras,
        'api_output_tokens': raw_out,
        'api_input_tokens': raw_in,
    }
    if pl == 'gemini':
        thinking = extras.get('thoughts_token_count')
        if thinking:
            md['thinking_tokens_reported'] = thinking
        if bill_out != raw_out:
            md['output_tokens_billed_for_cost'] = bill_out
    elif pl == 'claude':
        if bill_in != raw_in:
            md['input_tokens_billed_for_cost'] = bill_in

    meter = _active.get()
    if meter is not None:
        meter.record(
            step_type=step_type[:40],
            provider=provider_label[:40],
            model_name=model_name[:100],
            input_tokens=raw_in,
            output_tokens=raw_out,
            success=success,
            metadata=md,
            estimated_cost_override_cents=max(0, int(cents)),
        )
        return

    setattr(
        provider_self,
        '_pending_ai_usage_log',
        {
            'step_type': step_type[:40],
            'model_name': model_name[:100],
            'input_tokens': raw_in,
            'output_tokens': raw_out,
            'estimated_cost_cents': max(0, int(cents)),
            'success': bool(success),
            'metadata': {**md, 'provider': provider_label},
        },
    )


def peek_pending_ai_usage_log(provider_self: Any) -> dict[str, Any] | None:
    raw = getattr(provider_self, '_pending_ai_usage_log', None)
    if not isinstance(raw, dict):
        return None
    return raw


def clear_pending_ai_usage_log(provider_self: Any) -> None:
    if hasattr(provider_self, '_pending_ai_usage_log'):
        delattr(provider_self, '_pending_ai_usage_log')


@dataclass
class _LedgerEntry:
    step_type: str
    provider: str
    model_name: str
    input_tokens: int
    output_tokens: int
    estimated_cost_cents: int
    success: bool
    metadata: dict[str, Any] = field(default_factory=dict)


class PipelineAIMeter:
    """Sammelt gemessene Tokens + schreibt am Ende :class:`~apps.boards.models.AIUsageLog`."""

    def __init__(self, *, user: 'AbstractUser | None') -> None:
        self.user = user
        self._entries: list[_LedgerEntry] = []

    def record(
        self,
        *,
        step_type: str,
        provider: str,
        model_name: str,
        input_tokens: int,
        output_tokens: int,
        success: bool = True,
        metadata: dict[str, Any] | None = None,
        estimated_cost_override_cents: int | None = None,
    ) -> None:
        md = metadata or {}
        cents_raw = estimated_cost_override_cents
        if cents_raw is None:
            cents = estimate_cost_cents(
                provider=provider,
                model=model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        else:
            cents = max(0, int(cents_raw))
        note = _pricing_metadata_note(
            model_name=model_name,
            cents=cents,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        if note:
            md = {**md, 'pricing_note': note}
        entry = _LedgerEntry(
            step_type=step_type[:40],
            provider=provider[:40],
            model_name=model_name[:100],
            input_tokens=max(0, int(input_tokens)),
            output_tokens=max(0, int(output_tokens)),
            estimated_cost_cents=cents,
            success=bool(success),
            metadata=md,
        )
        self._entries.append(entry)
        cents_s = f'~${entry.estimated_cost_cents / 100:.4f}' if entry.estimated_cost_cents else '?'
        think = md.get('thinking_tokens_reported')
        think_s = f' think={think}' if think else ''
        logger.info(
            '%s %s provider=%s model=%s in=%s out=%s%s est=%s',
            PRINT_PREFIX,
            step_type,
            provider,
            model_name,
            entry.input_tokens,
            entry.output_tokens,
            think_s,
            cents_s,
        )

    def flush_logs_to_db(
        self,
        *,
        board=None,
        metadata_extra: dict[str, Any] | None = None,
    ) -> None:
        if not self._entries:
            return
        from apps.boards.models import AIUsageLog

        extra = metadata_extra or {}
        for e in self._entries:
            AIUsageLog.objects.create(
                user=self.user,
                board=board,
                step_type=e.step_type[:40],
                model_name=e.model_name[:100],
                input_tokens=e.input_tokens,
                output_tokens=e.output_tokens,
                estimated_cost_cents=e.estimated_cost_cents,
                success=e.success,
                metadata={**e.metadata, **extra, 'provider': e.provider},
            )
        total_usd = sum(int(e.estimated_cost_cents) for e in self._entries)
        if self.user is not None and total_usd > 0:
            from apps.accounts.services.credits import charge_ai_usage_usd_cents

            charge_ai_usage_usd_cents(self.user, total_usd)
        self._entries.clear()

    def flush_logs_to_board(self, board: Any) -> None:
        self.flush_logs_to_db(board=board)

    def print_totals(self) -> None:
        tin = sum(x.input_tokens for x in self._entries)
        tout = sum(x.output_tokens for x in self._entries)
        tthink = sum(int(x.metadata.get('thinking_tokens_reported') or 0) for x in self._entries)
        cents = sum(x.estimated_cost_cents for x in self._entries)
        cnt = len(self._entries)
        usd_est = cents / 100 if cents else 0
        think_part = f' thinking_reported~{tthink}' if tthink else ''
        logger.info(
            '%s SUMMARY calls=%s tokens_in~%s tokens_out~%s%s est_total~$%.4f',
            PRINT_PREFIX,
            cnt,
            tin,
            tout,
            think_part,
            usd_est,
        )


def get_active_meter() -> PipelineAIMeter | None:
    return _active.get()


def record_if_active_meter(
    *,
    step_type: str,
    provider: str,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    success: bool = True,
    metadata: dict[str, Any] | None = None,
) -> None:
    m = _active.get()
    if m is None:
        return
    m.record(
        step_type=step_type,
        provider=provider,
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        success=success,
        metadata=metadata,
    )


@contextmanager
def generation_meter_context(*, user: 'AbstractUser | None') -> Iterator[PipelineAIMeter]:
    meter = PipelineAIMeter(user=user)
    token = _active.set(meter)
    try:
        yield meter
        meter.print_totals()
    finally:
        try:
            if meter._entries:
                logger.info(
                    '%s generation_meter_context: Auto-Abrechnung (%s Einträge, kein explizites flush)',
                    PRINT_PREFIX,
                    len(meter._entries),
                )
                meter.flush_logs_to_db(metadata_extra={'meter_auto_flush': True})
        finally:
            _active.reset(token)
