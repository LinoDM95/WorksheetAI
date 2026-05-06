import { useState } from 'react';
import { Presentation, QrCode } from 'lucide-react';
import { BoardFullscreenPreview, type BoardFullscreenToolbarContext } from '../BoardFullscreenPreview';
import { BoardShareQrModal } from '../BoardShareQrModal';
import { Button } from '../../../../components/ui';
import { cn } from '../../../../lib/cn';
import { buildStudentBoardUrl } from '../../publicBoardApi';
import type { DatasetId, LibraryId } from '../../types';

export type BoardLibraryLivePreviewVariant = 'community' | 'owner';

export type BoardLibraryLivePreviewProps = {
  boardId: string;
  boardTitle: string;
  layoutKey: string;
  html: string;
  css: string;
  javascript: string;
  usedLibraries: LibraryId[];
  usedDatasets?: DatasetId[];
  variant: BoardLibraryLivePreviewVariant;
  shareToken?: string | null;
  studentLinkEnabled?: boolean;
};

export function BoardLibraryLivePreview({
  boardId,
  boardTitle,
  layoutKey,
  html,
  css,
  javascript,
  usedLibraries,
  usedDatasets,
  variant,
  shareToken,
  studentLinkEnabled,
}: BoardLibraryLivePreviewProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [scriptsEnabled, setScriptsEnabled] = useState(true);
  const [shareQrOpen, setShareQrOpen] = useState(false);

  const isOwnerTools = variant === 'owner';
  const showQr = Boolean(isOwnerTools && shareToken && studentLinkEnabled);

  const toolbarExtras = isOwnerTools
    ? ({ browserFs }: BoardFullscreenToolbarContext) => (
        <>
          <Button
            as="link"
            to={`/app/boards/${boardId}/play`}
            variant="secondary"
            size="sm"
            className={cn('!px-2', browserFs && '!border-white/20 !bg-white/10 !text-white hover:!bg-white/15')}
            title="Vollständiger Präsentationsmodus mit großer Leiste"
            aria-label="Präsentationsmodus öffnen"
            leftIcon={<Presentation size={14} aria-hidden />}
          >
            <span className="hidden sm:inline">Präsentieren</span>
          </Button>
          {showQr ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn('!px-2', browserFs && '!border-white/20 !bg-white/10 !text-white hover:!bg-white/15')}
              title="QR-Code für Schüler:innen"
              aria-label="QR-Code für Schüler:innen"
              leftIcon={<QrCode size={14} aria-hidden />}
              onClick={() => setShareQrOpen(true)}
            >
              <span className="hidden sm:inline">QR</span>
            </Button>
          ) : null}
        </>
      )
    : undefined;

  return (
    <>
      <BoardFullscreenPreview
        layoutKey={layoutKey}
        viewTransitionGroupName="board-library-live-fs-root"
        toolbarExtras={toolbarExtras}
        reloadKey={reloadKey}
        onReload={() => setReloadKey((k) => k + 1)}
        html={html}
        css={css}
        javascript={javascript}
        boardFrameId={`library-live-${boardId}`}
        usedLibraries={usedLibraries}
        usedDatasets={usedDatasets}
        scriptsEnabled={isOwnerTools ? scriptsEnabled : true}
        showScriptsToggle={isOwnerTools}
        onScriptsEnabledChange={isOwnerTools ? setScriptsEnabled : undefined}
      />

      {showQr && shareToken ? (
        <BoardShareQrModal
          open={shareQrOpen}
          onClose={() => setShareQrOpen(false)}
          studentUrl={buildStudentBoardUrl(shareToken)}
          title={boardTitle}
        />
      ) : null}
    </>
  );
}
