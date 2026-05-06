import { useEffect } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router-dom';
import { AppShell } from '../../../components/shell/AppShell';

const BOARD_LIB_INDEX_RELOAD_KEY = '__wl_board_library_index_f5__';

export function BoardLibraryWorkspace() {
  const location = useLocation();
  const preview = useMatch({ path: '/app/boards/library/:libraryBoardId', end: true });
  const indexExact = useMatch({ path: '/app/boards/library', end: true });
  const isPreview = Boolean(preview);

  useEffect(() => {
    const inSubtree = /^\/app\/boards\/library(\/|$)/.test(location.pathname);
    if (!inSubtree) {
      sessionStorage.removeItem(BOARD_LIB_INDEX_RELOAD_KEY);
      return;
    }
    if (!indexExact) return;

    const s = sessionStorage.getItem(BOARD_LIB_INDEX_RELOAD_KEY);
    if (s === 'idle') return;
    if (s === 'consume') {
      sessionStorage.setItem(BOARD_LIB_INDEX_RELOAD_KEY, 'idle');
      return;
    }
    sessionStorage.setItem(BOARD_LIB_INDEX_RELOAD_KEY, 'consume');
    window.location.reload();
  }, [location.pathname, indexExact]);

  return (
    <AppShell
      fullBleed
      layoutVariant="focus"
      topbar={{
        title: isPreview ? 'Board-Vorschau' : 'Bibliothek',
        subtitle: isPreview
          ? 'Live testen wie im Unterricht; bei eigenem Board: Präsentieren und QR möglich'
          : 'Marktplatz für interaktive Boards — ausprobieren, bewerten und Ideen übernehmen',
        breadcrumbs: isPreview ? ['Smartboard', 'Bibliothek', 'Vorschau'] : ['Smartboard', 'Bibliothek'],
      }}
    >
      <Outlet />
    </AppShell>
  );
}
