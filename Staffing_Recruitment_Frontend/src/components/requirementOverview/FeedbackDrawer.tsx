'use client';

import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { InterviewRecord } from '@/lib/api/interviews';
import { updateInterview } from '@/lib/api/interviews';
import { patchSubmission } from '@/lib/api/submissions';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';

type Props = {
  open: boolean;
  onClose: () => void;
  submissionId: string | null;
  interviews: InterviewRecord[];
  onDone: () => void;
};

export function FeedbackDrawer({ open, onClose, submissionId, interviews, onDone }: Props) {
  const interview = useMemo(
    () =>
      submissionId
        ? [...interviews].filter((i) => i.submissionId === submissionId).sort(
            (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
          )[0]
        : undefined,
    [interviews, submissionId],
  );

  const [rating, setRating] = useState('4');
  const [feedback, setFeedback] = useState('');
  const [outcome, setOutcome] = useState<'Selected' | 'Rejected' | 'Interview' | 'Submitted'>('Interview');
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSave = async () => {
    if (!submissionId || !interview) {
      setError('No interview found for this candidate yet.');
      return;
    }
    if (outcome === 'Rejected' && !rejectReason.trim()) {
      setError('Rejection reason is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let finalDecision = 'INTERVIEW';
      if (outcome === 'Selected') finalDecision = 'SELECTED';
      if (outcome === 'Rejected') finalDecision = 'REJECTED';
      if (outcome === 'Submitted') finalDecision = 'SUBMITTED';

      await updateInterview(interview.id, {
        feedback,
        rating: Number(rating) || null,
        finalDecision,
      });

      await patchSubmission(submissionId, {
        status: outcome === 'Rejected' ? 'Rejected' : outcome === 'Selected' ? 'Selected' : 'Interview',
        ...(outcome === 'Rejected' ? { rejectionReason: rejectReason.trim() } : { comments: feedback.trim() || undefined }),
      });

      onDone();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save feedback');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close backdrop" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Interview feedback</div>
            <div className="text-sm font-semibold text-gray-900">{interview?.candidate.name ?? 'Candidate'}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {!interview ? (
            <p className="text-sm text-amber-700">Schedule an interview first, then record feedback.</p>
          ) : (
            <>
              <Field label="Overall rating (1–5)">
                <Select value={rating} onChange={(e) => setRating(e.target.value)}>
                  {['1', '2', '3', '4', '5'].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Feedback">
                <Textarea rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              </Field>
              <Field label="Outcome for submission">
                <Select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                >
                  <option value="Selected">Selected</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Interview">Interview / Hold</option>
                  <option value="Submitted">Submitted</option>
                </Select>
              </Field>
              {outcome === 'Rejected' ? (
                <Field label="Rejection reason">
                  <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                </Field>
              ) : null}
            </>
          )}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" disabled={saving || !interview} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
