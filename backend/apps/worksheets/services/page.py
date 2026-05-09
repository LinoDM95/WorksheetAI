from .content_line_budget import compute_content_line_budget

A4 = {'portrait': {'width_mm':210, 'height_mm':297}, 'landscape': {'width_mm':297, 'height_mm':210}}

def normalize_page_setup(data: dict, *, app_sheet_header: bool | None = None):
    """``app_sheet_header``: None = aus ``data['line_budget_include_app_header']`` lesen, Standard True."""
    orientation = data.get('orientation','portrait') if data else 'portrait'
    if orientation not in A4: orientation='portrait'
    margins = (data or {}).get('margins_mm') or {}
    margins = {k: float(margins.get(k, 12)) for k in ['top','right','bottom','left']}
    size = A4[orientation]
    safe = {
        'x_mm': margins['left'], 'y_mm': margins['top'],
        'width_mm': max(10, size['width_mm'] - margins['left'] - margins['right']),
        'height_mm': max(10, size['height_mm'] - margins['top'] - margins['bottom']),
    }
    include_header = True
    if app_sheet_header is not None:
        include_header = bool(app_sheet_header)
    elif isinstance(data, dict) and 'line_budget_include_app_header' in data:
        include_header = bool(data.get('line_budget_include_app_header'))

    base = {
        'format':'A4','orientation':orientation,'unit':'mm',
        'width_mm':size['width_mm'],'height_mm':size['height_mm'],
        'margins_mm':margins,'safe_area':safe,'renderer':'html',
        'line_budget_include_app_header': include_header,
    }
    base['content_line_budget'] = compute_content_line_budget(base, app_sheet_header=include_header)
    return base
