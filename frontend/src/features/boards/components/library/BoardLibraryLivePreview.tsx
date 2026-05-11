import { useState } from 'react';
import { BoardFullscreenPreview, type BoardFullscreenPreviewProps } from '../BoardFullscreenPreview';
import type { DatasetId, LibraryId } from '../../types';

export type BoardLibraryLivePreviewProps = {
  boardId: string;
  layoutKey: string;
  html: string;
  css: string;
  javascript: string;
  usedLibraries: LibraryId[];
  usedDatasets?: DatasetId[];
  shareToolbarAction?: BoardFullscreenPreviewProps['shareToolbarAction'];
  toolbarExtras?: BoardFullscreenPreviewProps['toolbarExtras'];
  shareOverlayPortalRef?: BoardFullscreenPreviewProps['shareOverlayPortalRef'];
};

export function BoardLibraryLivePreview({
  boardId,
  layoutKey,
  html,
  css,
  javascript,
  usedLibraries,
  usedDatasets,
  shareToolbarAction,
  toolbarExtras,
  shareOverlayPortalRef,
}: BoardLibraryLivePreviewProps) {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <BoardFullscreenPreview
      layoutKey={layoutKey}
      viewTransitionGroupName="board-library-live-fs-root"
      reloadKey={reloadKey}
      onReload={() => setReloadKey((k) => k + 1)}
      html={html}
      css={css}
      javascript={javascript}
      boardFrameId={`library-live-${boardId}`}
      usedLibraries={usedLibraries}
      usedDatasets={usedDatasets}
      scriptsEnabled
      shareToolbarAction={shareToolbarAction}
      toolbarExtras={toolbarExtras}
      shareOverlayPortalRef={shareOverlayPortalRef}
    />
  );
}
