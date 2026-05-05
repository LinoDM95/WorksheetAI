"""Anthropic Claude — `AI_PROVIDER=claude` oder Ultra-Modus für Free-HTML-Tafelbilder."""
from __future__ import annotations

import json
import re
from typing import Any

import anthropic
from django.conf import settings

from apps.ai.prompt_loader import (
    build_block_filling_page_prompt,
    build_free_html_generation_prompt,
    build_free_html_repair_prompt,
    build_free_html_revision_prompt,
    build_page_regeneration_prompt,
    build_worksheet_generation_prompt_for_gemini,
    build_worksheet_review_prompt,
)

_JSON_FENCE_RE = re.compile(r'```(?:json)?\s*([\s\S]*?)\s*```', re.IGNORECASE)


def _extract_json_object(text: str) -> dict[str, Any]:
    raw = (text or '').strip()
    if not raw:
        return {}
    m = _JSON_FENCE_RE.search(raw)
    if m:
        raw = m.group(1).strip()
    if not raw.startswith('{'):
        i0 = raw.find('{')
        i1 = raw.rfind('}')
        if i0 != -1 and i1 > i0:
            raw = raw[i0 : i1 + 1]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'Claude-Antwort ist kein gültiges JSON: {exc}') from exc
    return data if isinstance(data, dict) else {}


class ClaudeWorksheetProvider:
    """Gleiche öffentliche Methoden wie ``GeminiWorksheetProvider``."""

    def __init__(self) -> None:
        key = (getattr(settings, 'CLAUDE_API_KEY', None) or '').strip()
        if not key:
            raise RuntimeError('CLAUDE_API_KEY is missing. Add it to backend/.env')
        timeout = float(getattr(settings, 'CLAUDE_TIMEOUT_SECONDS', 600))
        self.client = anthropic.Anthropic(api_key=key, timeout=timeout)
        self.model = str(getattr(settings, 'CLAUDE_MODEL', 'claude-sonnet-4-20250514') or 'claude-sonnet-4-20250514')
        self.max_tokens = int(getattr(settings, 'CLAUDE_MAX_OUTPUT_TOKENS', 32768))

    def _complete(self, *, system: str | None, user: str, temperature: float) -> str:
        kwargs: dict[str, Any] = {
            'model': self.model,
            'max_tokens': self.max_tokens,
            'messages': [{'role': 'user', 'content': user}],
        }
        if getattr(settings, 'CLAUDE_SEND_TEMPERATURE', False):
            kwargs['temperature'] = temperature
        if system:
            kwargs['system'] = system
        try:
            msg = self.client.messages.create(**kwargs)
        except anthropic.AuthenticationError as exc:
            raise RuntimeError('Claude: ungültiger API-Key oder Auth-Fehler.') from exc
        except anthropic.RateLimitError as exc:
            raise RuntimeError(f'Claude: Rate-Limit / 429 — {exc}') from exc
        except anthropic.APIError as exc:
            raise RuntimeError(f'Claude-API-Fehler: {exc}') from exc

        parts: list[str] = []
        for block in msg.content:
            if hasattr(block, 'type') and block.type == 'text' and hasattr(block, 'text'):
                parts.append(block.text)
        return ''.join(parts)

    def generate(self, payload: dict) -> dict[str, Any]:
        req = payload.get('request') or {}
        system_instr, user_content = build_worksheet_generation_prompt_for_gemini(
            req,
            payload.get('page_setup') or {},
            payload.get('pattern') or {},
            curriculum_context=payload.get('curriculum_context'),
        )
        temp = float(getattr(settings, 'CLAUDE_WORKSHEET_TEMPERATURE', settings.GEMINI_TEMPERATURE))
        text = self._complete(system=system_instr, user=user_content, temperature=temp)
        return _extract_json_object(text)

    def review_worksheet(
        self,
        content: dict,
        request: dict,
        page_setup: dict,
        pattern: dict,
    ) -> dict[str, Any]:
        prompt = build_worksheet_review_prompt(content, request, page_setup, pattern)
        temp = 0.15
        text = self._complete(system=None, user=prompt, temperature=temp)
        return _extract_json_object(text)

    def regenerate_page(self, payload: dict) -> dict[str, Any]:
        prompt = build_page_regeneration_prompt(payload)
        temp = float(getattr(settings, 'CLAUDE_WORKSHEET_TEMPERATURE', settings.GEMINI_TEMPERATURE))
        text = self._complete(system=None, user=prompt, temperature=temp)
        return _extract_json_object(text)

    def generate_free_html_board(self, payload: dict) -> dict[str, Any]:
        from apps.boards.services.free_html_prompt_context import build_resource_context

        ctx = build_resource_context()
        user = build_free_html_generation_prompt({**(payload or {}), **ctx})
        user = (
            user
            + '\n\n---\n\n**Wichtig:** Antworte ausschließlich mit einem einzigen JSON-Objekt '
            '(kein Markdown, keine Code-Fences, kein Fließtext davor oder danach).'
        )
        temp = float(getattr(settings, 'BOARDS_FREE_HTML_GENERATION_TEMPERATURE', 0.55))
        text = self._complete(system=None, user=user, temperature=temp)
        return _extract_json_object(text)

    def revise_free_html_board(self, payload: dict) -> dict[str, Any]:
        from apps.boards.services.free_html_prompt_context import build_resource_context

        ctx = build_resource_context()
        user = build_free_html_revision_prompt({**(payload or {}), **ctx})
        user = (
            user
            + '\n\n---\n\n**Wichtig:** Antworte ausschließlich mit einem einzigen JSON-Objekt '
            '(kein Markdown, keine Code-Fences, kein Fließtext davor oder danach).'
        )
        temp = float(getattr(settings, 'BOARDS_FREE_HTML_REVISION_TEMPERATURE', 0.4))
        text = self._complete(system=None, user=user, temperature=temp)
        return _extract_json_object(text)

    def repair_free_html_board(self, payload: dict) -> dict[str, Any]:
        user = build_free_html_repair_prompt(payload or {})
        user = (
            user
            + '\n\n---\n\n**Wichtig:** Antworte ausschließlich mit einem einzigen JSON-Objekt '
            '(kein Markdown, keine Code-Fences, kein Fließtext davor oder danach).'
        )
        temp = float(getattr(settings, 'BOARDS_FREE_HTML_REPAIR_TEMPERATURE', 0.25))
        text = self._complete(system=None, user=user, temperature=temp)
        return _extract_json_object(text)

    def generate_block_contents(self, payload: dict[str, Any]) -> dict[str, Any]:
        user = build_block_filling_page_prompt(payload or {})
        user = (
            user
            + '\n\n---\n\n**Wichtig:** Antworte ausschließlich mit einem einzigen JSON-Objekt '
            'im Format {"slot_contents":[{"instance_id":"…","content":{…}}, …]} — '
            'kein Markdown, keine Code-Fences, kein Fließtext davor oder danach.'
        )
        temp = float(getattr(settings, 'BOARDS_BLOCKS_FILLING_TEMPERATURE', 0.45))
        text = self._complete(system=None, user=user, temperature=temp)
        return _extract_json_object(text)
