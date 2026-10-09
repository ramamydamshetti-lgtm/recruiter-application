import React, { type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-end justify-between gap-3">
        <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</label>
        {hint ? <span className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}

export const inputBase =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition duration-200 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-0 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/30';

export const TextInput = React.forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, type, min, max, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        min={min}
        max={max}
        {...rest}
        className={cn(inputBase, className)}
      />
    );
  },
);
TextInput.displayName = 'TextInput';

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select {...rest} className={cn(inputBase, className)}>
      {children}
    </select>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea {...rest} className={cn(inputBase, 'min-h-28 resize-y', className)} />;
}
