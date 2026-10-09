'use client';

import React, { useCallback, useState } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type FileUploadConfig = {
  accept: string[]; // e.g. ['.pdf', '.doc', '.docx']
  maxSizeBytes: number;
  acceptLabel: string; // e.g. "PDF, DOC, DOCX"
};

const RESUME_CONFIG: FileUploadConfig = {
  accept: ['.pdf', '.doc', '.docx'],
  maxSizeBytes: 5 * 1024 * 1024,
  acceptLabel: 'PDF, DOC, DOCX',
};

const JD_CONFIG: FileUploadConfig = {
  accept: ['.pdf', '.docx'],
  maxSizeBytes: 10 * 1024 * 1024,
  acceptLabel: 'PDF, DOCX',
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function validateFile(file: File, config: FileUploadConfig): string | null {
  const ext = getFileExtension(file.name);
  const validExt = config.accept.some((a) => a.toLowerCase() === ext);
  if (!validExt) {
    return `Invalid file type. Accepted: ${config.acceptLabel}.`;
  }
  if (file.size > config.maxSizeBytes) {
    return `File exceeds ${formatBytes(config.maxSizeBytes)} limit.`;
  }
  return null;
}

type FileUploadProps = {
  config: 'resume' | 'jd';
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  className?: string;
  showPreviewCard?: boolean;
};

export function FileUpload({
  config: configKey,
  value,
  onChange,
  error,
  className,
  showPreviewCard = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  const config = configKey === 'resume' ? RESUME_CONFIG : JD_CONFIG;
  const acceptStr = config.accept.join(',');

  const validateAndSet = useCallback(
    (file: File | null) => {
      setInternalError(null);
      if (!file) {
        onChange(null);
        return;
      }
      const err = validateFile(file, config);
      if (err) {
        setInternalError(err);
        return;
      }
      onChange(file);
    },
    [config, onChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSet(file);
    },
    [validateAndSet],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSet(file);
      e.target.value = '';
    },
    [validateAndSet],
  );

  const displayError = error || internalError;

  return (
    <div className={cn('space-y-3', className)}>
      {!value ? (
        <label
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-all duration-200',
            'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50',
            'dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-blue-500 dark:hover:bg-blue-950/30',
            'focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2',
            isDragging && 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
            displayError && 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30',
          )}
        >
          <input
            type="file"
            accept={acceptStr}
            onChange={handleChange}
            className="sr-only"
            aria-invalid={!!displayError}
          />
          <UploadCloud
            className={cn(
              'h-10 w-10 text-gray-500 transition-colors dark:text-zinc-400',
              isDragging ? 'text-blue-600 dark:text-blue-400' : 'group-hover:text-blue-600 dark:group-hover:text-blue-400',
            )}
          />
          <p className="mt-2 text-sm font-medium text-gray-700 dark:text-zinc-200">
            Drop file here or <span className="text-blue-600 dark:text-blue-400">browse</span>
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
            {config.acceptLabel} • Max {formatBytes(config.maxSizeBytes)}
          </p>
        </label>
      ) : (
        <div
          className={cn(
            'flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900',
            showPreviewCard && 'flex-col items-stretch gap-3 sm:flex-row sm:items-center',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 dark:bg-blue-950/30">
              <UploadCloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-zinc-100">{value.name}</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400">{formatBytes(value.size)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-2 shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:scale-105 hover:bg-red-50 hover:text-red-700 hover:border-red-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-red-950/30 dark:hover:text-red-400 dark:hover:border-red-800"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Remove</span>
          </button>
        </div>
      )}
      {displayError && (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">{displayError}</p>
      )}
    </div>
  );
}

export { RESUME_CONFIG, JD_CONFIG };
