"""Tests für Token-Kostenschätzung und Fallback-Preise (Credits-Abbuchung)."""
from django.test import TestCase, override_settings

from apps.boards.services.pipeline_ai_meter import estimate_cost_cents


class EstimateCostFallbackTests(TestCase):
    @override_settings(
        AI_GEMINI_FLASH_INPUT_PRICE_PER_MILLION_USD=0,
        AI_GEMINI_FLASH_OUTPUT_PRICE_PER_MILLION_USD=0,
        AI_FALLBACK_INPUT_PRICE_PER_MILLION_USD=1.0,
        AI_FALLBACK_OUTPUT_PRICE_PER_MILLION_USD=2.0,
    )
    def test_gemini_flash_uses_fallback_when_tier_prices_zero(self) -> None:
        cents = estimate_cost_cents(
            provider='gemini',
            model='gemini-2.5-flash',
            input_tokens=1_000_000,
            output_tokens=500_000,
        )
        self.assertEqual(cents, 200)

    @override_settings(
        AI_GEMINI_FLASH_INPUT_PRICE_PER_MILLION_USD=0.50,
        AI_GEMINI_FLASH_OUTPUT_PRICE_PER_MILLION_USD=1.50,
        AI_FALLBACK_INPUT_PRICE_PER_MILLION_USD=99.0,
        AI_FALLBACK_OUTPUT_PRICE_PER_MILLION_USD=99.0,
    )
    def test_explicit_tier_price_wins_over_fallback(self) -> None:
        cents = estimate_cost_cents(
            provider='gemini',
            model='gemini-2.5-flash',
            input_tokens=1_000_000,
            output_tokens=0,
        )
        self.assertEqual(cents, 50)

    @override_settings(
        AI_FALLBACK_INPUT_PRICE_PER_MILLION_USD=0,
        AI_FALLBACK_OUTPUT_PRICE_PER_MILLION_USD=0,
        AI_GEMINI_FLASH_INPUT_PRICE_PER_MILLION_USD=0,
        AI_GEMINI_FLASH_OUTPUT_PRICE_PER_MILLION_USD=0,
    )
    def test_all_zero_stays_zero(self) -> None:
        cents = estimate_cost_cents(
            provider='gemini',
            model='gemini-2.5-flash',
            input_tokens=1000,
            output_tokens=1000,
        )
        self.assertEqual(cents, 0)

    @override_settings(
        AI_GEMINI_PRO_INPUT_PRICE_PER_MILLION_USD=2.0,
        AI_GEMINI_PRO_OUTPUT_PRICE_PER_MILLION_USD=12.0,
        AI_GEMINI_LONG_CONTEXT_INPUT_PRICE_PER_MILLION_USD=4.0,
        AI_GEMINI_LONG_CONTEXT_OUTPUT_PRICE_PER_MILLION_USD=18.0,
        AI_GEMINI_PROMPT_TOKEN_THRESHOLD_LONG_CONTEXT=200_000,
        AI_FALLBACK_INPUT_PRICE_PER_MILLION_USD=99.0,
        AI_FALLBACK_OUTPUT_PRICE_PER_MILLION_USD=99.0,
    )
    def test_gemini_pro_short_vs_long_prompt_tiers(self) -> None:
        short = estimate_cost_cents(
            provider='gemini',
            model='gemini-3-pro-preview',
            input_tokens=100_000,
            output_tokens=1_000_000,
        )
        self.assertEqual(short, 20 + 1200)
        long = estimate_cost_cents(
            provider='gemini',
            model='gemini-3-pro-preview',
            input_tokens=200_001,
            output_tokens=0,
        )
        self.assertEqual(long, 80)
