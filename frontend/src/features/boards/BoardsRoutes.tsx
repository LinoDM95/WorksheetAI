import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import {
  BoardDetailPageOutlet,
  BoardExplorerPlaceholder,
  BoardsWorkspacePage,
} from './pages/BoardsWorkspacePage';
import { BoardLibraryPage } from './pages/BoardLibraryPage';

/** Wenn ein NavLink fälschlich relativ war, entstand z. B. /app/boards/<alt>/<neu> — auf das eigentliche Tafelbild leiten. */
function DoubleBoardSegmentRedirect() {
  const { id } = useParams<{ stale?: string; id: string }>();
  if (!id || id === 'library' || id === 'new') {
    return <Navigate to="/app/boards" replace />;
  }
  return <Navigate to={`/app/boards/${id}`} replace />;
}

export function BoardsRoutes() {
  return (
    <Routes>
      <Route path="library" element={<BoardLibraryPage />} />
      <Route path="new" element={<Navigate to="/app/boards" replace />} />
      <Route element={<BoardsWorkspacePage />}>
        <Route index element={<BoardExplorerPlaceholder />} />
        <Route path=":stale/:id" element={<DoubleBoardSegmentRedirect />} />
        <Route path=":id" element={<BoardDetailPageOutlet />} />
      </Route>
      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  );
}
