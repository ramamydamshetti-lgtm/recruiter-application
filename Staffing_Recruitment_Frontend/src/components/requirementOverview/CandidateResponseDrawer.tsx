'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput, Textarea } from '@/components/ui/Field';
import { recordOfferLetterResponse, type OfferLetterRecord } from '@/lib/api/offerLetters';
import { notify } from '@/lib/notify';

type Props = {
  open: boolean;
  onClose: () => void;
  submissionId: string | null;
  candidateName?: string;
  candidateEmail?: string;
  offer?: OfferLetterRecord | null;
  onDone: () => void;
};

export function CandidateResponseDrawer({
  open,
  onClose,
  submissionId,
  candidateName,
  candidateEmail,
  offer,
  onDone,
}: Props) {
  const [response, setResponse] = useState<'INTERESTED' | 'NOT_INTERESTED'>('INTERESTED');
  const [joiningDate, setJoiningDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const isDeclined = offer?.status === 'DECLINED';
    setResponse(isDeclined ? 'NOT_INTERESTED' : 'INTERESTED');
    setJoiningDate(offer?.acceptedJoiningDate ? offer.acceptedJoiningDate.slice(0, 10) : '');
    setReason(offer?.declineReason ?? '');
    setError(null);
  }, [open, offer]);

  const canSave = useMemo(() => {
    if (response === 'INTERESTED') return Boolean(joiningDate);
    return Boolean(reason.trim());
  }, [response, joiningDate, reason]);

  if (!open || !submissionId) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (response === 'INTERESTED') {
        await recordOfferLetterResponse(submissionId, {
          decision: 'accept',
          acceptedJoiningDate: joiningDate,
        });
        notify.success('Candidate response saved as Interested.');
      } else {
        await recordOfferLetterResponse(submissionId, {
          decision: 'decline',
          declineReason: reason.trim(),
        });
        notify.success('Candidate response saved as Not Interested.');
      }
      onDone();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save candidate response');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close backdrop" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Candidate response</div>
            <div className="text-sm font-semibold text-gray-900">{candidateName ?? 'Candidate'}</div>
            <p className="mt-1 text-xs text-gray-500">
              Capture candidate interest after offer release
              {candidateEmail ? ` (${candidateEmail})` : ''}.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <Field label="Candidate response">
            <Select value={response} onChange={(e) => setResponse(e.target.value as 'INTERESTED' | 'NOT_INTERESTED')}>
              <option value="INTERESTED">Interested</option>
              <option value="NOT_INTERESTED">Not Interested</option>
            </Select>
          </Field>

          {response === 'INTERESTED' ? (
            <Field label="Joining date">
              <TextInput type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
            </Field>
          ) : (
            <Field label="Reason (for not interested)">
              <Textarea
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Candidate declined due to compensation, location, counter offer, etc."
              />
            </Field>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" disabled={!canSave || saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save Response'}
          </Button>
        </div>
      </div>
    </div>
  );
}
