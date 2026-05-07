export const WorksheetStringList = ({ label, items }: { label: string; items?: unknown }) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  const strings = items.filter((x): x is string => typeof x === 'string');
  if (strings.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
        {strings.map((s, i) => (
          <li key={`${i}-${s.slice(0, 48)}`}>{s}</li>
        ))}
      </ul>
    </div>
  );
};
