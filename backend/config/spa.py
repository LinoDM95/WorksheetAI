from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse


def spa_index_view(request):
    if request.method not in ('GET', 'HEAD'):
        raise Http404()
    index = settings.FRONTEND_DIST_DIR / 'index.html'
    if not index.is_file():
        raise Http404()
    if request.method == 'HEAD':
        length = index.stat().st_size
        return HttpResponse(
            headers={
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Length': str(length),
            },
        )
    return FileResponse(index.open('rb'), content_type='text/html; charset=utf-8')
