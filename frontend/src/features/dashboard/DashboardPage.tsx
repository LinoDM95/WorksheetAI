import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BOARDS_LIST_QUERY_KEY,
  WORKSHEET_LIST_QUERY_KEY,
  WORKSHEET_LIST_STALE_MS,
  boardsLibraryQueryKey,
  fetchWorksheetList,
} from '../../lib/listQueries';
import { fetchBoardLibrary, fetchBoards } from '../../features/boards/boardsApi';
import { useAuth } from '../../lib/authContext';
import { SEASONAL_KEYWORDS_BY_MONTH, greetingByHour } from './dashboardConstants';
import type { RecentWorksheet } from './dashboardTypes';
import { ContinueSection, HeroHeader, LibraryRow, ThemeChipsSection } from './DashboardSections';
import { useDashboardDerived } from './useDashboardDerived';

export function DashboardPage() {
  const { user } = useAuth();
  const greeting = useMemo(() => greetingByHour(new Date().getHours()), []);
  const seasonal = useMemo(() => SEASONAL_KEYWORDS_BY_MONTH[new Date().getMonth() + 1], []);

  const { data: wsData, isPending: worksheetsPending } = useQuery({
    queryKey: WORKSHEET_LIST_QUERY_KEY,
    queryFn: () => fetchWorksheetList<RecentWorksheet>(),
    staleTime: WORKSHEET_LIST_STALE_MS,
  });
  const { data: boardsData, isPending: boardsPending } = useQuery({
    queryKey: BOARDS_LIST_QUERY_KEY,
    queryFn: fetchBoards,
    staleTime: WORKSHEET_LIST_STALE_MS,
  });
  const { data: libraryData = [], isPending: libraryPending, isError: libraryError } = useQuery({
    queryKey: boardsLibraryQueryKey('all'),
    queryFn: () => fetchBoardLibrary('all'),
    staleTime: 60_000,
  });

  const {
    continueItems,
    newestLibrary,
    popularLibrary,
    seasonalLibrary,
    subjectChips,
    userTopSubject,
    userSubjectLibrary,
  } = useDashboardDerived(boardsData, wsData, libraryData, seasonal);

  const greetingName = user?.first_name?.trim();
  const continueLoading = worksheetsPending && boardsPending;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-7 px-3 pb-12 pt-4 sm:px-4 sm:pt-5 lg:px-6">
      <HeroHeader greeting={greeting} greetingName={greetingName} />

      <ContinueSection items={continueItems} loading={continueLoading} />

      <LibraryRow
        title="Neu in der Bibliothek"
        description="Frische Smartboards aus dem Netzwerk — direkt aus der Community."
        items={newestLibrary}
        loading={libraryPending}
        error={libraryError}
        seeAllHref="/app/boards/library?sort=new&kind=boards"
      />

      {seasonal && seasonalLibrary.length > 0 ? (
        <LibraryRow
          title={`Passend zur Jahreszeit · ${seasonal.label}`}
          description="Boards, die thematisch in den Mai passen — sofort einsetzbar im Unterricht."
          items={seasonalLibrary}
          loading={false}
          seeAllHref="/app/boards/library?sort=new&kind=boards"
        />
      ) : null}

      {popularLibrary.length > 0 ? (
        <LibraryRow
          title="Beliebt bei Kolleg:innen"
          description="Hoch bewertete Boards mit echten Stimmen aus der Lehrerschaft."
          items={popularLibrary}
          loading={libraryPending}
          seeAllHref="/app/boards/library?sort=most_rated&kind=boards"
        />
      ) : null}

      {userTopSubject && userSubjectLibrary.length > 0 ? (
        <LibraryRow
          title={`Mehr aus deinem Fach · ${userTopSubject}`}
          description={`Wir sehen viel ${userTopSubject} bei dir — hier sind passende Boards aus der Community.`}
          items={userSubjectLibrary}
          loading={false}
          seeAllHref={`/app/boards/library?sort=new&kind=boards&subject=${encodeURIComponent(userTopSubject)}`}
        />
      ) : null}

      <ThemeChipsSection chips={subjectChips} />
    </div>
  );
}
