import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

export type TimelineItem = {
  id: string;
  title: string;
  description?: string;
  href?: string;
  timestamp: string; // ISO
};

function formatTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const MAX_RECENT_ITEMS = 5;

export function ActivityTimeline({
  items,
  className,
}: {
  items: TimelineItem[];
  className?: string;
}) {
  const visibleItems = items.slice(0, MAX_RECENT_ITEMS);

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950',
        className,
      )}
    >
      <div className="text-sm font-semibold text-gray-900 dark:text-zinc-50">Recent Activity</div>
      <div className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
        A quick view of your latest actions.
      </div>

      <div className="mt-6 space-y-5">
        {visibleItems.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-zinc-400">
            No recent activity yet.
          </div>
        ) : (
        visibleItems.map((it, idx) => {
          const content = (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 group-hover:underline dark:text-zinc-50">
                  {it.title}
                </div>
                {it.description ? (
                  <div className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
                    {it.description}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-xs text-gray-500 dark:text-zinc-400">
                {formatTs(it.timestamp)}
              </div>
            </div>
          );

          return (
            <div key={it.id} className="relative pl-8">
              <div
                className="absolute top-0 left-3 h-full w-px bg-gray-200 dark:bg-zinc-800"
                aria-hidden="true"
              />
              <div className="absolute top-1 left-1.5 h-3 w-3 rounded-full border border-gray-300 bg-white dark:border-zinc-700 dark:bg-zinc-950" />

              {it.href ? (
                <Link
                  href={it.href}
                  className="group -mx-2 -my-1 block rounded-lg px-2 py-1 transition hover:bg-gray-50 dark:hover:bg-zinc-900/60"
                >
                  {content}
                </Link>
              ) : (
                content
              )}

              {idx === visibleItems.length - 1 ? (
                <div
                  className="absolute bottom-0 left-3 h-1 w-px bg-transparent"
                  aria-hidden="true"
                />
              ) : null}
            </div>
          );
        })
        )}
      </div>
    </div>
  );
}
