'use client';

import React, { useEffect, useState } from 'react';
import { getInterviewRoundsForRequirement, type InterviewRoundApiRow } from '@/lib/api/interviewRounds';
import { formatDateTime } from '@/lib/utils/dateTime';

export function InterviewRoundsTab({ requirementId }: { requirementId: string }) {
  const [rows, setRows] = useState<InterviewRoundApiRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getInterviewRoundsForRequirement(requirementId);
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
      <h2 className="text-lg font-semibold text-gray-900">Interview rounds (spec table)</h2>
      <p className="mt-1 text-xs text-gray-500">
        Rows from <code className="rounded bg-gray-100 px-1">interview_rounds</code>, dual-written from legacy interviews.
      </p>
      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No interview rounds yet — schedule from the pipeline.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                <th className="pb-2 pr-4">Candidate</th>
                <th className="pb-2 pr-4">Round</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">When</th>
                <th className="pb-2">Interviewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4 font-medium text-gray-900">{r.candidateName ?? '—'}</td>
                  <td className="py-2 pr-4">{r.roundType}</td>
                  <td className="py-2 pr-4">{r.status}</td>
                  <td className="py-2 pr-4">{formatDateTime(r.scheduledAt)}</td>
                  <td className="py-2 text-xs text-gray-600">
                    {r.interviewerName || r.interviewerEmail || '—'}
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
