import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-class merging helper — vermeidet doppelte/konfliktierende Utility-Klassen. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
