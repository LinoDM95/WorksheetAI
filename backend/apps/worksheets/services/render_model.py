from .page import normalize_page_setup
from .content_blocks import normalize_pages

def build_render_model(content: dict, page_setup: dict, pattern=None, request=None):
    page=normalize_page_setup(page_setup)
    req=request or {}; creativity=req.get('creativity','balanced')
    template_id=(pattern.blueprint.get('layout',{}) if pattern else {}).get('template_id','classic_linear_v1')
    theme=req.get('theme','neutral')
    pages=normalize_pages(content, page_setup=page)
    presentation=dict(content.get('presentation') or {})
    if not presentation:
        presentation={
            'register':'neutral','text_scale':'md','task_text_scale':'md','heading_scale':'2xl',
            'line_height':'normal','density':'normal',
            'planning_rationale':'Keine explizite Planung geliefert (Legacy-Inhalt).',
        }
    tokens=tokens_for(theme, creativity, presentation)
    flat_blocks=[b for pg in pages for b in pg['blocks']]
    return {
        'version':'html-a4-v2-multi',
        'page_setup': page,
        'template_id': template_id,
        'theme': theme,
        'creativity': creativity,
        'tokens': tokens,
        'pages': pages,
        'presentation': presentation,
        'blocks': flat_blocks,
        'solutions': content.get('solutions', []),
        'title': content.get('title','Arbeitsblatt'),
        'subtitle': content.get('subtitle',''),
    }

def tokens_for(_theme, _creativity, presentation=None):
    """Nur noch sachliche Struktur — Theme/Creativity werden ignoriert; Farben einheitlich neutral."""
    presentation = presentation or {}
    structural = {
        'primary': '#111827',
        'secondary': '#525252',
        'soft': '#ffffff',
        'accent': '#525252',
    }
    out = {
        'palette': structural,
        'radius': '0',
        'font_scale': 'normal',
        'presentation': presentation,
    }
    ts = presentation.get('text_scale')
    if ts in ('xl', 'large'):
        out['font_scale'] = 'large'
    if ts in ('xs', 'sm', 'small'):
        out['font_scale'] = 'small'
    return out
