"""Meter: Thinking-/Cache-Billing, idempotenter Flush, Kontext-Autoflush."""
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.boards.models import AIUsageLog
from apps.boards.services.pipeline_ai_meter import (
    PipelineAIMeter,
    generation_meter_context,
    log_standalone_gemini_usage,
    route_provider_usage,
)


User = get_user_model()


class _DummyProvider:
    pass


class _GeminiRespEmptyUsageMeta:
    """Simuliert API ohne usage_metadata (Fallback über Zeichenlänge)."""

    usage_metadata = None
    text = 'out' * 200


class MeterBillingTests(TestCase):
    def test_flush_twice_does_not_duplicate_logs(self) -> None:
        user = User.objects.create_user(
            username='meter1@test.example',
            email='meter1@test.example',
            password='TestPass123!',
        )
        meter = PipelineAIMeter(user=user)
        meter.record(
            step_type='risk',
            provider='gemini',
            model_name='gemini-2.5-flash',
            input_tokens=100,
            output_tokens=50,
            success=True,
            metadata={},
            estimated_cost_override_cents=10,
        )
        meter.flush_logs_to_db()
        meter.flush_logs_to_db()
        self.assertEqual(AIUsageLog.objects.filter(user=user).count(), 1)

    @override_settings(
        AI_GEMINI_FLASH_INPUT_PRICE_PER_MILLION_USD=1.0,
        AI_GEMINI_FLASH_OUTPUT_PRICE_PER_MILLION_USD=1.0,
        AI_FALLBACK_INPUT_PRICE_PER_MILLION_USD=0,
        AI_FALLBACK_OUTPUT_PRICE_PER_MILLION_USD=0,
    )
    def test_gemini_thinking_increases_estimated_cost(self) -> None:
        user = User.objects.create_user(
            username='meter2@test.example',
            email='meter2@test.example',
            password='TestPass123!',
        )
        with generation_meter_context(user=user) as meter:
            route_provider_usage(
                provider_self=_DummyProvider(),
                step_type='blocks_slot_fill',
                provider_label='gemini',
                model_name='gemini-2.5-flash',
                input_tokens=0,
                output_tokens=500_000,
                metadata={'thoughts_token_count': 500_000},
            )
            route_provider_usage(
                provider_self=_DummyProvider(),
                step_type='blocks_slot_fill',
                provider_label='gemini',
                model_name='gemini-2.5-flash',
                input_tokens=0,
                output_tokens=500_000,
                metadata={},
            )
            with_think = meter._entries[0].estimated_cost_cents
            no_think = meter._entries[1].estimated_cost_cents
            self.assertEqual(with_think, 100)
            self.assertEqual(no_think, 50)
            self.assertGreater(with_think, no_think)

    @override_settings(
        AI_CLAUDE_INPUT_PRICE_PER_MILLION_USD=1.0,
        AI_CLAUDE_OUTPUT_PRICE_PER_MILLION_USD=1.0,
        AI_FALLBACK_INPUT_PRICE_PER_MILLION_USD=0,
        AI_FALLBACK_OUTPUT_PRICE_PER_MILLION_USD=0,
    )
    def test_claude_cache_read_adds_to_billable_input(self) -> None:
        user = User.objects.create_user(
            username='meter3@test.example',
            email='meter3@test.example',
            password='TestPass123!',
        )
        with generation_meter_context(user=user) as meter:
            route_provider_usage(
                provider_self=_DummyProvider(),
                step_type='code_generation',
                provider_label='claude',
                model_name='claude-sonnet',
                input_tokens=0,
                output_tokens=0,
                metadata={'cache_read_input_tokens': 1_000_000},
            )
            self.assertGreater(meter._entries[0].estimated_cost_cents, 0)

    def test_generation_meter_context_auto_flushes_orphan_entries(self) -> None:
        user = User.objects.create_user(
            username='meter4@test.example',
            email='meter4@test.example',
            password='TestPass123!',
        )
        with generation_meter_context(user=user) as meter:
            meter.record(
                step_type='risk',
                provider='gemini',
                model_name='gemini-2.5-flash',
                input_tokens=1,
                output_tokens=1,
                success=True,
                metadata={},
                estimated_cost_override_cents=1,
            )
        self.assertEqual(AIUsageLog.objects.filter(user=user).count(), 1)
        self.assertEqual(len(meter._entries), 0)

    @override_settings(
        AI_GEMINI_FLASH_INPUT_PRICE_PER_MILLION_USD=1000.0,
        AI_GEMINI_FLASH_OUTPUT_PRICE_PER_MILLION_USD=1000.0,
        AI_FALLBACK_INPUT_PRICE_PER_MILLION_USD=0,
        AI_FALLBACK_OUTPUT_PRICE_PER_MILLION_USD=0,
    )
    def test_log_standalone_gemini_estimates_tokens_when_usage_metadata_missing(self) -> None:
        user = User.objects.create_user(
            username='meter5@test.example',
            email='meter5@test.example',
            password='TestPass123!',
        )
        log_standalone_gemini_usage(
            resp=_GeminiRespEmptyUsageMeta(),
            model='gemini-2.5-flash',
            step_type='worksheet_generation',
            user=user,
            fallback_char_source='in' * 200,
        )
        row = AIUsageLog.objects.get(user=user)
        self.assertEqual(row.step_type, 'worksheet_generation')
        self.assertEqual(row.input_tokens, 100)
        self.assertEqual(row.output_tokens, 150)
        self.assertGreater(row.estimated_cost_cents, 0)
