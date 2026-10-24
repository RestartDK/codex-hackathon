import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-2xl border border-white/15 bg-slate-950/90 p-5 text-slate-100 shadow-2xl', className)} {...props} />;
}
