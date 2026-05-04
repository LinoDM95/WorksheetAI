import json
from django.conf import settings
from google import genai
from google.genai import types
from apps.ai.prompt_loader import (
    build_page_regeneration_prompt,
    build_worksheet_generation_prompt,
    build_worksheet_review_prompt,
)

SCHEMA = {
  'type': 'OBJECT',
  'description': (
    'Complete printable worksheet JSON. Balance each A4 page: avoid a huge empty lower area, but **do not cram** '
    'too many blocks, long texts, and tall line stacks on one page — **split across pages[]** or reduce answer_lines '
    '/ writing_lines when a page would look packed. If a page is sparse and time budget allows, add **at most** '
    '1–2 substantive tasks or moderately more lines — not "max everything". '
    'Every task_grid/task_list item MUST contain a full student-facing task in "text" (never only a title). '
    'text blocks MUST have a non-empty "content" paragraph. For open-ended tasks: answer_lines on task_list '
    'and/or writing_lines with line counts that match expected length and remaining space — never end a page with '
    'only questions and no lines.'
  ),
  'properties': {
    'title': {'type': 'STRING', 'description': 'Main worksheet title'},
    'subtitle': {'type': 'STRING', 'description': 'Optional subtitle line under title'},
    'presentation': {
      'type': 'OBJECT',
      'properties': {
        'register': {'type': 'STRING'},
        'text_scale': {'type': 'STRING'},
        'task_text_scale': {'type': 'STRING'},
        'heading_scale': {'type': 'STRING'},
        'line_height': {'type': 'STRING'},
        'density': {'type': 'STRING'},
        'planning_rationale': {'type': 'STRING'},
      },
      'required': ['register', 'text_scale', 'task_text_scale', 'heading_scale', 'line_height', 'density', 'planning_rationale'],
    },
    'pages': {
      'type': 'ARRAY',
      'minItems': 1,
      'description': (
        'One entry per A4 page. Move overflow to the next page entry instead of overloading one page. Per page: '
        'use vertical space sensibly — neither mostly blank (when time allows) nor visually overcrowded.'
      ),
      'items': {
        'type': 'OBJECT',
        'properties': {
          'page_label': {'type': 'STRING'},
          'blocks': {
            'type': 'ARRAY',
            'minItems': 1,
            'description': (
              'Content blocks in order: concrete tasks and info text. For practice sheets, a typical count is '
              'about 4–6 task_list/task_grid items per page (or 5–8 if each item is very short); split to another '
              'page if adding more would crowd the layout.'
            ),
            'items': {
              'type': 'OBJECT',
              'properties': {
                'type': {'type': 'STRING', 'description': 'Block kind: text, task_grid, task_list, table, checklist, drawing_box, writing_lines'},
                'id': {'type': 'STRING'},
                'title': {'type': 'STRING', 'description': 'Section heading shown to students'},
                'content': {'type': 'STRING', 'description': 'Full prose for text blocks (instructions, context).'},
                'instruction': {'type': 'STRING', 'description': 'For drawing_box.'},
                'lines': {
                    'type': 'INTEGER',
                    'description': (
                        'For type writing_lines: number of ruled lines (e.g. reflection 10–14 when the page is not '
                        'already busy; use fewer lines or the next page if many other tasks/lines exist). '
                        'For type text: optional lines under the paragraph.'
                    ),
                },
                'items': {
                    'type': 'ARRAY',
                    'description': (
                        'For task_grid/task_list/checklist: list of items with full wording in text. '
                        'For task_list: optional answer_lines per item = writing lines below that task '
                        '(0 for numeric/one-word; about 5–10 for explanations depending on level; use the lower '
                        'end when the page already has many items/lines; omit uses client default).'
                    ),
                    'items': {
                        'type': 'OBJECT',
                        'properties': {
                            'label': {'type': 'STRING'},
                            'text': {'type': 'STRING', 'description': 'Complete task wording (with LaTeX for math).'},
                            'answer_lines': {
                                'type': 'INTEGER',
                                'description': (
                                    'task_list items only: ruled lines below this question. '
                                    '0 = none. If omitted, app uses a default. Open questions: typically 5–10; '
                                    'avoid maxing every item on an already full page.'
                                ),
                            },
                        },
                    },
                },
                'columns': {'type': 'ARRAY', 'items': {'type': 'OBJECT'}},
                'rows': {'type': 'ARRAY', 'items': {'type': 'OBJECT'}},
                'headers': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
              },
              'required': ['type', 'title'],
            },
          },
        },
        'required': ['blocks'],
      },
    },
    'slots': {'type': 'OBJECT'},
    'solutions': {'type': 'ARRAY', 'items': {'type': 'OBJECT'}},
    'design_notes': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
  },
  'required': ['title', 'pages', 'solutions', 'presentation'],
}

PAGE_REGEN_SCHEMA = {
    'type': 'OBJECT',
    'description': (
        'One worksheet page only: new blocks and optional page_label. '
        'Full redesign of this page while staying on topic.'
    ),
    'properties': {
        'page_label': SCHEMA['properties']['pages']['items']['properties']['page_label'],
        'blocks': SCHEMA['properties']['pages']['items']['properties']['blocks'],
    },
    'required': ['blocks'],
}


class GeminiWorksheetProvider:
    def __init__(self):
        if not settings.GEMINI_API_KEY:
            raise RuntimeError('GEMINI_API_KEY is missing. Add it to backend/.env')
        timeout_ms = settings.GEMINI_TIMEOUT_SECONDS * 1000
        self.client = genai.Client(
            api_key=settings.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=timeout_ms),
        )
    def generate(self, payload: dict) -> dict:
        req = payload.get('request') or {}
        prompt = build_worksheet_generation_prompt(
            req,
            payload.get('page_setup') or {},
            payload.get('pattern') or {},
        )
        gen_cfg = {
            'temperature': settings.GEMINI_TEMPERATURE,
            'max_output_tokens': settings.GEMINI_MAX_OUTPUT_TOKENS,
            'response_mime_type': 'application/json',
            'response_schema': SCHEMA,
        }
        resp = self.client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**gen_cfg),
        )
        text = resp.text or '{}'
        return json.loads(text)

    def review_worksheet(
        self,
        content: dict,
        request: dict,
        page_setup: dict,
        pattern: dict,
    ) -> dict:
        prompt = build_worksheet_review_prompt(content, request, page_setup, pattern)
        gen_cfg = {
            'temperature': 0.15,
            'max_output_tokens': settings.GEMINI_MAX_OUTPUT_TOKENS,
            'response_mime_type': 'application/json',
            'response_schema': SCHEMA,
        }
        resp = self.client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**gen_cfg),
        )
        text = resp.text or '{}'
        return json.loads(text)

    def regenerate_page(self, payload: dict) -> dict:
        prompt = build_page_regeneration_prompt(payload)
        gen_cfg = {
            'temperature': settings.GEMINI_TEMPERATURE,
            'max_output_tokens': settings.GEMINI_MAX_OUTPUT_TOKENS,
            'response_mime_type': 'application/json',
            'response_schema': PAGE_REGEN_SCHEMA,
        }
        resp = self.client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**gen_cfg),
        )
        text = resp.text or '{}'
        return json.loads(text)
