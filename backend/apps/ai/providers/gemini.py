import json
import logging
import time
from django.conf import settings
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)
from apps.ai.prompt_loader import (
    build_block_filling_page_prompt,
    build_free_html_generation_prompt,
    build_free_html_repair_prompt,
    build_free_html_revision_prompt,
    build_page_regeneration_prompt,
    build_worksheet_generation_prompt_for_gemini,
    build_worksheet_review_prompt,
)

# Diagramm-spec: kind + kind-spezifische Felder (Modell setzt nur passende Untermenge).
_DIAGRAM_SPEC_SCHEMA = {
    'type': 'OBJECT',
    'description': (
        'Required when block type is diagram. kind = unit_circle | right_triangle | coordinate_axes; '
        'only use fields valid for that kind. No LaTeX in numeric fields.'
    ),
    'properties': {
        'kind': {'type': 'STRING', 'description': 'unit_circle | right_triangle | coordinate_axes'},
        'angle_deg': {'type': 'NUMBER', 'description': 'unit_circle: angle alpha in degrees CCW from +x'},
        'show_angle_arc': {'type': 'BOOLEAN'},
        'show_projections': {'type': 'BOOLEAN'},
        'point_label': {'type': 'STRING'},
        'radius_label': {'type': 'STRING'},
        'right_angle_at': {'type': 'STRING', 'description': 'right_triangle: vertex letter with right angle, e.g. C'},
        'vertices': {
            'type': 'OBJECT',
            'description': 'right_triangle: A,B,C as [x,y] in diagram units 0-10',
            'properties': {
                'A': {'type': 'ARRAY', 'items': {'type': 'NUMBER'}, 'minItems': 2, 'maxItems': 2},
                'B': {'type': 'ARRAY', 'items': {'type': 'NUMBER'}, 'minItems': 2, 'maxItems': 2},
                'C': {'type': 'ARRAY', 'items': {'type': 'NUMBER'}, 'minItems': 2, 'maxItems': 2},
            },
        },
        'angle_labels': {
            'type': 'OBJECT',
            'description': 'right_triangle: maps angle name to vertex letter, e.g. alpha -> A',
            'properties': {
                'alpha': {'type': 'STRING'},
                'beta': {'type': 'STRING'},
                'gamma': {'type': 'STRING'},
            },
        },
        'side_labels': {
            'type': 'OBJECT',
            'properties': {
                'AB': {'type': 'STRING'},
                'BC': {'type': 'STRING'},
                'CA': {'type': 'STRING'},
                'AC': {'type': 'STRING'},
                'BA': {'type': 'STRING'},
                'CB': {'type': 'STRING'},
            },
        },
        'x_min': {'type': 'NUMBER'},
        'x_max': {'type': 'NUMBER'},
        'y_min': {'type': 'NUMBER'},
        'y_max': {'type': 'NUMBER'},
        'grid': {'type': 'BOOLEAN'},
    },
    'required': ['kind'],
}

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
    'only questions and no lines. For math diagrams use type diagram with a valid spec object (no TikZ/raw SVG). '
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
                'type': {
                    'type': 'STRING',
                    'description': (
                        'Block kind: text, task_grid, task_list, table, checklist, drawing_box, writing_lines, '
                        'diagram (machine-rendered SVG from spec)'
                    ),
                },
                'id': {'type': 'STRING'},
                'title': {'type': 'STRING', 'description': 'Section heading — for diagram: MUST match spec.kind (unit_circle→Einheitskreis not „Dreieck“)'},
                'content': {'type': 'STRING', 'description': 'Full prose for text blocks (instructions, context).'},
                'instruction': {
                    'type': 'STRING',
                    'description': 'For drawing_box. Optional for diagram (hint for learners).',
                },
                'height_mm': {
                    'type': 'NUMBER',
                    'description': (
                        'drawing_box only: minimum height of the dashed drawing area in mm (typical ~35–55 simple '
                        'sketch; ~70–100 construction; ~110–140 complex). Always set from instruction difficulty.'
                    ),
                },
                'expand_to_page_bottom': {
                    'type': 'BOOLEAN',
                    'description': (
                        'drawing_box only: if true and this is the **last** block on the page, stretch the box to '
                        'fill remaining vertical space on the A4 content area (still respect height_mm as minimum).'
                    ),
                },
                'figure_label': {'type': 'STRING', 'description': 'Optional e.g. Abb. 1 for diagram'},
                'spec': _DIAGRAM_SPEC_SCHEMA,
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
    'curriculum_alignment': {
      'type': 'OBJECT',
      'description': (
        'Internal only: which curriculum aspects guided this worksheet. Not shown on the printed sheet. '
        'Omit or use empty strings/arrays if no curriculum context was supplied.'
      ),
      'properties': {
        'used_topic_area': {'type': 'STRING'},
        'used_subtopics': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'used_competency_goals': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'used_task_types': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'used_language_guidance': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'notes': {'type': 'STRING'},
      },
    },
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


FREE_HTML_SCHEMA = {
    'type': 'OBJECT',
    'description': (
        'Free HTML5 smartboard fragment. No full documents. No external URLs in strings. '
        'html = inner content only; wrap in .free-board. Vanilla JS only. '
        'used_libraries / used_assets / used_datasets MUST list only IDs from the provided '
        'resource registry — never invent IDs or external URLs.'
    ),
    'properties': {
        'title': {'type': 'STRING'},
        'description': {'type': 'STRING'},
        'html': {'type': 'STRING'},
        'css': {'type': 'STRING'},
        'javascript': {'type': 'STRING'},
        'teacher_notes': {'type': 'STRING'},
        'usage_instructions': {
            'type': 'ARRAY',
            'items': {'type': 'STRING'},
        },
        'warnings': {
            'type': 'ARRAY',
            'items': {'type': 'STRING'},
        },
        'used_libraries': {
            'type': 'ARRAY',
            'description': 'Library IDs from the registry that the JS/HTML actually relies on.',
            'items': {'type': 'STRING'},
        },
        'used_assets': {
            'type': 'ARRAY',
            'description': 'Asset IDs from the registry that the HTML/CSS references.',
            'items': {'type': 'STRING'},
        },
        'used_datasets': {
            'type': 'ARRAY',
            'description': 'Dataset IDs from the registry that the JS fetches via fetch alternative or inline.',
            'items': {'type': 'STRING'},
        },
    },
    'required': ['title', 'html', 'css', 'javascript'],
}


BLOCK_SLOT_FILL_SCHEMA = {
    'type': 'OBJECT',
    'description': (
        'Block mode: fill one content object per board slot. Keys and nesting must match each slot schema from the prompt.'
    ),
    'properties': {
        'slot_contents': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'instance_id': {'type': 'STRING'},
                    'content': {'type': 'OBJECT'},
                },
                'required': ['instance_id', 'content'],
            },
        },
    },
    'required': ['slot_contents'],
}


def _is_gemini_deadline_exceeded(exc: BaseException) -> bool:
    """API-interne Frist überschritten (Google), nicht dasselbe wie Client-ReadTimeout."""
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


class GeminiWorksheetProvider:
    def __init__(self):
        if not settings.GEMINI_API_KEY:
            raise RuntimeError('GEMINI_API_KEY is missing. Add it to backend/.env')
        timeout_ms = settings.GEMINI_TIMEOUT_SECONDS * 1000
        self.client = genai.Client(
            api_key=settings.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=timeout_ms),
        )

    def _generate_content(self, *, model: str, contents, config: types.GenerateContentConfig):
        retries = max(0, int(getattr(settings, 'GEMINI_DEADLINE_RETRIES', 0)))
        delay_base = float(getattr(settings, 'GEMINI_DEADLINE_RETRY_DELAY_SECONDS', 60.0))
        exponential = bool(getattr(settings, 'GEMINI_DEADLINE_RETRY_EXPONENTIAL', False))
        total_attempts = retries + 1
        last: BaseException | None = None
        for attempt in range(total_attempts):
            try:
                return self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
            except BaseException as exc:
                last = exc
                if attempt >= retries or not _is_gemini_deadline_exceeded(exc):
                    raise
                pause = delay_base * (2**attempt) if exponential else delay_base
                logger.warning(
                    'Gemini DEADLINE_EXCEEDED (Aufruf %s/%s), Pause %.0f s, dann erneuter Versuch',
                    attempt + 1,
                    total_attempts,
                    pause,
                )
                time.sleep(pause)
        assert last is not None
        raise last

    def generate(self, payload: dict) -> dict:
        req = payload.get('request') or {}
        system_instr, user_content = build_worksheet_generation_prompt_for_gemini(
            req,
            payload.get('page_setup') or {},
            payload.get('pattern') or {},
            curriculum_context=payload.get('curriculum_context'),
        )
        gen_cfg = {
            'temperature': settings.GEMINI_TEMPERATURE,
            'max_output_tokens': settings.GEMINI_MAX_OUTPUT_TOKENS,
            'response_mime_type': 'application/json',
            'response_schema': SCHEMA,
        }
        if system_instr:
            gen_cfg['system_instruction'] = system_instr
        resp = self._generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_content,
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
        resp = self._generate_content(
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
        resp = self._generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**gen_cfg),
        )
        text = resp.text or '{}'
        return json.loads(text)

    def generate_block_contents(self, payload: dict) -> dict:
        prompt = build_block_filling_page_prompt(payload or {})
        gen_cfg = {
            'temperature': float(getattr(settings, 'BOARDS_BLOCKS_FILLING_TEMPERATURE', 0.45)),
            'max_output_tokens': settings.GEMINI_MAX_OUTPUT_TOKENS,
            'response_mime_type': 'application/json',
            'response_schema': BLOCK_SLOT_FILL_SCHEMA,
        }
        resp = self._generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**gen_cfg),
        )
        text = resp.text or '{}'
        return json.loads(text)

    def generate_free_html_board(self, payload: dict) -> dict:
        from apps.boards.services.free_html_prompt_context import build_resource_context

        ctx = build_resource_context()
        prompt = build_free_html_generation_prompt({**(payload or {}), **ctx})
        gen_cfg = {
            'temperature': float(getattr(settings, 'BOARDS_FREE_HTML_GENERATION_TEMPERATURE', 0.55)),
            'max_output_tokens': settings.GEMINI_MAX_OUTPUT_TOKENS,
            'response_mime_type': 'application/json',
            'response_schema': FREE_HTML_SCHEMA,
        }
        resp = self._generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**gen_cfg),
        )
        text = resp.text or '{}'
        return json.loads(text)

    def revise_free_html_board(self, payload: dict) -> dict:
        from apps.boards.services.free_html_prompt_context import build_resource_context

        ctx = build_resource_context()
        prompt = build_free_html_revision_prompt({**(payload or {}), **ctx})
        gen_cfg = {
            'temperature': float(getattr(settings, 'BOARDS_FREE_HTML_REVISION_TEMPERATURE', 0.4)),
            'max_output_tokens': settings.GEMINI_MAX_OUTPUT_TOKENS,
            'response_mime_type': 'application/json',
            'response_schema': FREE_HTML_SCHEMA,
        }
        resp = self._generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**gen_cfg),
        )
        text = resp.text or '{}'
        return json.loads(text)

    def repair_free_html_board(self, payload: dict) -> dict:
        prompt = build_free_html_repair_prompt(payload or {})
        gen_cfg = {
            'temperature': float(getattr(settings, 'BOARDS_FREE_HTML_REPAIR_TEMPERATURE', 0.25)),
            'max_output_tokens': settings.GEMINI_MAX_OUTPUT_TOKENS,
            'response_mime_type': 'application/json',
            'response_schema': FREE_HTML_SCHEMA,
        }
        resp = self._generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**gen_cfg),
        )
        text = resp.text or '{}'
        return json.loads(text)
