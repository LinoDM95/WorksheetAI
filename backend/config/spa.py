from django.conf import settings
from django.http import FileResponse, Http404


def spa_index_view(request):
    if request.method != 'GET':
        raise Http404()
    index = settings.FRONTEND_DIST_DIR / 'index.html'
    if not index.is_file():
        raise Http404()
    return FileResponse(index.open('rb'), content_type='text/html; charset=utf-8')
