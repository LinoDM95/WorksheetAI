from __future__ import annotations

import copy
from typing import Any

_CREATIVE_RENDER_KIND = 'html-a4-creative-v1'


def first_page_render_model_for_thumbnail(render_model: Any) -> dict | None:
    """Returns a shallow-deep copy of render_model with only the first page in `pages`, when applicable."""
    if not isinstance(render_model, dict) or not render_model:
        return None
    rm = copy.deepcopy(render_model)
    pages = rm.get('pages')
    if isinstance(pages, list) and len(pages) > 0:
        rm['pages'] = [copy.deepcopy(pages[0])]
        return rm
    blocks = rm.get('blocks')
    if isinstance(blocks, list) and len(blocks) > 0:
        return rm
    if rm.get('version') == _CREATIVE_RENDER_KIND:
        return rm
    return None
