/** Bezeichnung für Versionseinträge (neueste zuerst in der Liste → höhere V-Nummer = neuer). */
export const revisionVLabel = (indexFromNewest: number, total: number): string => {
  const vNum = total - indexFromNewest;
  return `V${vNum}`;
};
