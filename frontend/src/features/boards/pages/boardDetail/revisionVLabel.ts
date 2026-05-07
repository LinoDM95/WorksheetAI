/** Liste neueste zuerst (API): v1 = älteste Revision, höhere Nummer = neuer. */
export const revisionVLabel = (indexNewestFirst: number, total: number) => {
  const n = total > 0 ? total - indexNewestFirst : 1;
  return `v${n}`;
};
