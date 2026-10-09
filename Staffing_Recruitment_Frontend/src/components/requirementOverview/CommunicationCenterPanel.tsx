'use client';

import React, { useEffect, useState } from 'react';
import { getRequirementCommunications, type CommunicationLogRow } from '@/lib/api/requirements';
import { formatDateTime } from '@/lib/utils/dateTime';

export function CommunicationCenterPanel({ requirementId }: { requirementId: string }) {
  const [rows, setRows] = useState<CommunicationLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getRequirementCommunications(requirementId);
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requirementId]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Communication center</h2>
      <p className="mt-1 text-xs text-gray-500">
        Outbound mail captured when <code className="rounded bg-gray-100 px-1">MAIL_LOG_ENABLED=true</code> on the API.
      </p>
      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading delivery log…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          No communications logged yet. Enable mail logging on the backend and send a client submission or offer email.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                <th className="pb-2 pr-4">Time</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">To</th>
                <th className="pb-2 pr-4">Subject</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4 whitespace-nowrap text-gray-600">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="py-2 pr-4">{r.type}</td>
                  <td className="py-2 pr-4">{r.recipient}</td>
                  <td className="py-2 pr-4">{r.subject ?? '—'}</td>
                  <td className="py-2">
                    <span
                      className={
                        r.status === 'SENT'
                          ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                          : r.status === 'FAILED'
                            ? 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800'
                            : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-800'
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
