"""Smartboard AI Model Router — klein/groß für Pipeline-Tasks.

Trennt Klassifikations-/Brief-/Style-Aufgaben (klein, schnell, günstig) von
Code-Generierung/Reparatur (groß, präzise). Jeder Aufruf wird in
:class:`apps.boards.models.AIUsageLog` protokolliert.

Gemini-Aufrufe über :class:`apps.ai.providers.gemini.GeminiWorksheetProvider`
nutzen bei nicht verfügbarem Primärmodell automatisch ``GEMINI_MODEL_FALLBACK``
(eine zentrale Stelle in ``apps.ai.gemini_model_fallback``).

Verwendung::

    router = SmartboardAIModelRouter(user=user, board=board)
    data = router.call_small('intent', prompt, response_schema=...)
    code = router.call_large('code_generation', prompt, response_schema=...)

Die Methoden ``call_small`` / ``call_large`` liefern garantiert ein Dict
(leeres Dict bei Fehlern) und werfen nicht — der Aufrufer entscheidet, ob er
ohne LLM weitermachen kann (Heuristik) oder einen Fehler meldet.
"""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

from apps.ai.providers.factory import get_provider
from apps.ai.providers.claude import ClaudeWorksheetProvider
from apps.ai.providers.gemini import GeminiWorksheetProvider
from apps.ai.providers.mock import MockWorksheetProvider

logger = logging.getLogger(__name__)


def _charge_standalone_ai_log(user, usd_cents: int) -> None:
    """Router ohne aktiven Meter: Credits wie beim Eintrag ``estimated_cost_cents`` (USD-Cents)."""
    from apps.accounts.services.credits import charge_ai_usage_usd_cents

    if user is None:
        return
    charge_ai_usage_usd_cents(user, int(usd_cents))


# Welche Pipeline-Aufgabe braucht welche Modellgröße?
TASK_TO_SIZE: dict[str, str] = {
    'intent': 'small',
    'risk': 'small',
    'creative_brief': 'small',  # bei complexity=high explizit large() rufen
    'style_dna': 'small',
    'code_generation': 'large',
    'code_repair': 'large',
    'design_repair': 'large',
    'bug_fix': 'large',
    'revision': 'large',
    'screenshot_judge_summary': 'small',
    # Asset-Engine
    'asset_intent': 'small',
    'asset_plan': 'small',
    'asset_strategy': 'small',
    'asset_quality_judge': 'small',
    'asset_pack_consistency': 'small',
    'asset_svg_generation': 'large',
    'asset_repair': 'large',
}


# Asset-Engine kann eigenes Routing per Settings überschreiben.
ASSET_STEP_TYPES = {
    'asset_intent', 'asset_plan', 'asset_strategy',
    'asset_svg_generation', 'asset_repair', 'asset_quality_judge',
    'asset_pack_consistency', 'asset_pack_generation',
}


class SmartboardAIModelRouter:
    """Wählt klein/groß für Pipeline-Tasks und schreibt AIUsageLog-Einträge."""

    def __init__(self, *, user=None, board=None, complexity: str = 'medium') -> None:
        self.user = user
        self.board = board
        self.complexity = (complexity or 'medium').strip().lower() or 'medium'

    # ---------- Public API ----------

    def get_small_model(self, *, asset_phase: bool = False) -> str:
        if asset_phase:
            return str(getattr(
                settings, 'ASSET_SMALL_MODEL',
                getattr(settings, 'SMARTBOARD_SMALL_MODEL', 'gemini-2.5-flash'),
            ))
        return str(getattr(settings, 'SMARTBOARD_SMALL_MODEL', 'gemini-2.5-flash'))

    def get_large_model(self, *, asset_phase: bool = False) -> str:
        if asset_phase:
            return str(getattr(
                settings, 'ASSET_LARGE_MODEL',
                getattr(settings, 'SMARTBOARD_LARGE_MODEL', 'gemini-2.5-pro'),
            ))
        return str(getattr(settings, 'SMARTBOARD_LARGE_MODEL', 'gemini-2.5-pro'))

    def choose_for_task(self, task_type: str) -> dict[str, Any]:
        size = TASK_TO_SIZE.get(task_type, 'small')
        if task_type == 'creative_brief' and self.complexity in ('high', 'extreme'):
            size = 'large'
        asset_phase = task_type in ASSET_STEP_TYPES
        return {
            'task_type': task_type,
            'size': size,
            'model': (
                self.get_large_model(asset_phase=asset_phase)
                if size == 'large'
                else self.get_small_model(asset_phase=asset_phase)
            ),
            'provider': self._provider_name(size, asset_phase=asset_phase),
        }

    def call_small(
        self,
        log_step: str,
        prompt: str,
        *,
        response_schema: dict | None = None,
        temperature: float = 0.3,
    ) -> dict[str, Any]:
        return self._call(size='small', log_step=log_step, prompt=prompt,
                          response_schema=response_schema, temperature=temperature)

    def call_large(
        self,
        log_step: str,
        prompt: str,
        *,
        response_schema: dict | None = None,
        temperature: float = 0.45,
    ) -> dict[str, Any]:
        return self._call(size='large', log_step=log_step, prompt=prompt,
                          response_schema=response_schema, temperature=temperature)

    # ---------- Internals ----------

    def _provider_name(self, size: str, *, asset_phase: bool = False) -> str:
        if asset_phase:
            asset_key = (
                getattr(settings, 'ASSET_LARGE_MODEL_PROVIDER', None)
                if size == 'large'
                else getattr(settings, 'ASSET_SMALL_MODEL_PROVIDER', None)
            )
            if asset_key:
                return str(asset_key).strip().lower() or 'gemini'
        key = (
            getattr(settings, 'SMARTBOARD_LARGE_MODEL_PROVIDER', 'gemini')
            if size == 'large'
            else getattr(settings, 'SMARTBOARD_SMALL_MODEL_PROVIDER', 'gemini')
        )
        return str(key or 'gemini').strip().lower() or 'gemini'

    def _resolve_provider(self, size: str, *, asset_phase: bool = False):
        forced = (getattr(settings, 'BOARDS_AI_PROVIDER', 'default') or 'default').strip().lower()
        if forced == 'mock':
            return MockWorksheetProvider()
        provider_name = self._provider_name(size, asset_phase=asset_phase)
        if provider_name == 'mock':
            return MockWorksheetProvider()
        if provider_name == 'claude':
            return ClaudeWorksheetProvider()
        if provider_name == 'gemini':
            return GeminiWorksheetProvider()
        return get_provider()

    def _call(
        self,
        *,
        size: str,
        log_step: str,
        prompt: str,
        response_schema: dict | None,
        temperature: float,
    ) -> dict[str, Any]:
        from apps.boards.models import AIUsageLog

        from .pipeline_ai_meter import (
            clear_pending_ai_usage_log,
            estimate_cost_cents,
            get_active_meter,
            peek_pending_ai_usage_log,
            record_if_active_meter,
        )

        allowed_steps = {c[0] for c in AIUsageLog.STEP_TYPE_CHOICES}
        db_step = log_step if log_step in allowed_steps else 'risk'
        asset_phase = log_step in ASSET_STEP_TYPES
        model_name = (
            self.get_large_model(asset_phase=asset_phase)
            if size == 'large'
            else self.get_small_model(asset_phase=asset_phase)
        )
        provider = self._resolve_provider(size, asset_phase=asset_phase)
        provider_label = type(provider).__name__

        meter = get_active_meter()
        clear_pending_ai_usage_log(provider)

        if not hasattr(provider, 'call_with_model'):
            logger.warning(
                'Smartboard router: provider %s lacks call_with_model — returning {}',
                provider_label,
            )
            if meter:
                record_if_active_meter(
                    step_type=db_step,
                    provider=provider_label,
                    model_name=model_name,
                    input_tokens=max(0, int(len(prompt) / 4)),
                    output_tokens=0,
                    success=False,
                    metadata={'size': size, 'temperature': temperature, 'reason': 'no_call_with_model'},
                )
            else:
                AIUsageLog.objects.create(
                    user=self.user, board=self.board, step_type=db_step,
                    model_name=model_name, success=False,
                    error_message='provider lacks call_with_model',
                    metadata={'size': size, 'provider': provider_label},
                )
            return {}

        try:
            data = provider.call_with_model(
                model=model_name,
                prompt=prompt,
                response_schema=response_schema,
                temperature=temperature,
                trace_step=db_step,
            )
        except Exception as exc:  # KI-Fehler: Pipeline darf nicht crashen.
            logger.exception('Smartboard router %s call failed (%s)', size, log_step)
            approx_in = max(0, int(len(prompt) / 4))
            if meter:
                record_if_active_meter(
                    step_type=db_step,
                    provider=provider_label,
                    model_name=model_name,
                    input_tokens=approx_in,
                    output_tokens=0,
                    success=False,
                    metadata={'size': size, 'temperature': temperature, 'error': str(exc)[:300]},
                )
            else:
                AIUsageLog.objects.create(
                    user=self.user, board=self.board, step_type=db_step,
                    model_name=model_name, success=False,
                    error_message=str(exc)[:500],
                    metadata={'size': size, 'provider': provider_label},
                )
            return {}

        if not isinstance(data, dict):
            data = {}
        if meter is None:
            row = peek_pending_ai_usage_log(provider)
            if row:
                AIUsageLog.objects.create(
                    user=self.user,
                    board=self.board,
                    step_type=row['step_type'],
                    model_name=row['model_name'],
                    success=row['success'],
                    input_tokens=row['input_tokens'],
                    output_tokens=row['output_tokens'],
                    estimated_cost_cents=row['estimated_cost_cents'],
                    metadata={**row['metadata'], 'size': size, 'temperature': temperature},
                )
                _charge_standalone_ai_log(self.user, int(row['estimated_cost_cents']))
                clear_pending_ai_usage_log(provider)
            else:
                approx_in = max(0, int(len(prompt) / 4))
                est_usd = estimate_cost_cents(
                    provider=provider_label,
                    model=model_name,
                    input_tokens=approx_in,
                    output_tokens=0,
                )
                AIUsageLog.objects.create(
                    user=self.user, board=self.board, step_type=db_step,
                    model_name=model_name, success=True,
                    input_tokens=approx_in,
                    output_tokens=0,
                    estimated_cost_cents=est_usd,
                    metadata={'size': size, 'provider': provider_label,
                              'temperature': temperature, 'token_source': 'approx_prompt_chars'},
                )
                _charge_standalone_ai_log(self.user, est_usd)
        return data
