import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** Übereinstimmung Breadcrumb-Label (Topbar) → App-Pfad */
const BREADCRUMB_HREF: Record<string, string> = {
  Dashboard: '/app/dashboard',
  'Neues Blatt': '/app/create',
  'Meine Arbeitsblätter': '/app/worksheets',
  Vorlagen: '/app/patterns',
  Lehrpläne: '/app/curriculum',
  Bibliothek: '/app/boards/library',
  Einstellungen: '/app/settings',
};

export function parentHrefFromBreadcrumbs(crumbs: string[] | undefined): string {
  if (!crumbs?.length || crumbs.length < 2) return '/app/dashboard';
  const label = crumbs[crumbs.length - 2];
  return BREADCRUMB_HREF[label] ?? '/app/dashboard';
}

export function parentLabelFromBreadcrumbs(crumbs: string[] | undefined): string {
  if (!crumbs || crumbs.length < 2) return 'Dashboard';
  return crumbs[crumbs.length - 2];
}

export type ShellChromeValue = {
  /** Ziel für „Zurück“ zur übergeordneten Breadcrumb-Ebene */
  breadcrumbBackHref: string;
  breadcrumbBackLabel: string;
};

const ShellChromeContext = createContext<ShellChromeValue | null>(null);

export const ShellChromeProvider = ({
  breadcrumbs,
  children,
}: {
  breadcrumbs?: string[];
  children: ReactNode;
}) => {
  const value = useMemo(
    () => ({
      breadcrumbBackHref: parentHrefFromBreadcrumbs(breadcrumbs),
      breadcrumbBackLabel: parentLabelFromBreadcrumbs(breadcrumbs),
    }),
    [breadcrumbs],
  );
  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
};

export const useShellChrome = (): ShellChromeValue => {
  const v = useContext(ShellChromeContext);
  if (!v) {
    return { breadcrumbBackHref: '/app/dashboard', breadcrumbBackLabel: 'Dashboard' };
  }
  return v;
};
