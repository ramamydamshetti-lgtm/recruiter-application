'use client';

import React from 'react';
import { Copy } from 'lucide-react';

import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils/cn';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';

type CopyButtonProps = {
  value: string;
  label?: string;
  successMessage?: string;
  className?: string;
};

export function CopyButton({
  value,
  label = 'Copy',
  successMessage = 'Copied',
  className,
}: CopyButtonProps) {
  const copy = useCopyToClipboard();

  return (
    <span className="inline-flex">
      <button
        type="button"
        onClick={async () => {
          const ok = await copy(value);
          if (ok) notify.success(successMessage);
          else notify.error('Could not copy');
        }}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900',
          className,
        )}
        title={label}
        aria-label={label}
      >
        <Copy className="h-3.5 w-3.5" />
        <span>{label}</span>
      </button>
    </span>
  );
}
