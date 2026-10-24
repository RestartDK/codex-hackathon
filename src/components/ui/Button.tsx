import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Button({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'min-h-11 rounded-xl border border-emerald-300/35 bg-emerald-300 px-4 py-2 font-semibold text-slate-950 shadow-sm transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
