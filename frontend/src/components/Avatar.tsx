import { cn } from '../lib/cn';

type AvatarProps = {
  name: string;
  size?: number;
  className?: string;
};

/** Initialen-Avatar im Indigo-Stil (Sidebar/Topbar). */
export const Avatar = ({ name, size = 32, className }: AvatarProps) => {
  const initials = name
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className={cn(
        'inline-grid place-items-center rounded-full border border-indigo-100 bg-indigo-50 font-bold text-indigo-700',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials || '?'}
    </div>
  );
};
