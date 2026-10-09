'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput, Textarea } from '@/components/ui/Field';
import {
  releaseOfferLetter,
  saveOfferLetterDraft,
  type OfferLetterRecord,
} from '@/lib/api/offerLetters';
import { notify } from '@/lib/notify';

type Props = {
  open: boolean;
  onClose: () => void;
  submissionId: string | null;
  candidateName?: string;
  candidateEmail?: string;
  existing?: OfferLetterRecord | null;
  onDone: () => void;
};

export function OfferReleaseDrawer({
  open,
  onClose,
  submissionId,
  candidateName,
  candidateEmail,
  existing,
  onDone,
}: Props) {
  const [positionTitle, setPositionTitle] = useState('');
  const [compensation, setCompensation] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [letterContent, setLetterContent] = useState('');
  const [terms, setTerms] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setPositionTitle(existing.positionTitle ?? '');
      setCompensation(existing.compensation ?? '');
      setValidUntil(existing.validUntil ? existing.validUntil.slice(0, 10) : '');
      setJoiningDate(existing.joiningDate ? existing.joiningDate.slice(0, 10) : '');
      setLetterContent(existing.letterContent ?? '');
      setTerms(existing.terms ?? '');
      return;
    }
    setPositionTitle('');
    setCompensation('');
    setValidUntil('');
    setJoiningDate('');
    setLetterContent('');
    setTerms('');
    setError(null);
  }, [open, existing]);

  if (!open || !submissionId) return null;

  const isReleased = Boolean(existing && existing.status !== 'DRAFT');
  const isAccepted = existing?.status === 'ACCEPTED';
  const isDeclined = existing?.status === 'DECLINED';
  const lockMainFields = isReleased;

  const draftPayload = {
    positionTitle: positionTitle.trim() || null,
    compensation: compensation.trim() || null,
    validUntil: validUntil ? new Date(validUntil).toISOString() : null,
    joiningDate: joiningDate ? new Date(joiningDate).toISOString() : null,
    terms: terms.trim() || null,
    letterContent: letterContent.trim() || null,
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setError(null);
    try {
      await saveOfferLetterDraft(submissionId, draftPayload);
      onDone();
      notify.success('Offer draft saved.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save draft');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleRelease = async () => {
    setReleasing(true);
    setError(null);
    try {
      await saveOfferLetterDraft(submissionId, draftPayload);
      await releaseOfferLetter(submissionId, draftPayload);
      onDone();
      notify.success('Offer released and email sent to candidate.');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not release offer');
    } finally {
      setReleasing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close backdrop" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Offer release</div>
            <div className="text-sm font-semibold text-gray-900">{candidateName ?? 'Candidate'}</div>
            <p className="mt-1 text-xs text-gray-500">
              Save draft anytime. Once released, core fields lock and an email summary is sent
              {candidateEmail ? ` to ${candidateEmail}` : ' to the candidate'}.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-xs text-gray-700">
            <p className="font-semibold text-gray-900">1 · Selected candidate</p>
            <p className="mt-1">
              This offer applies to this submission. Releasing sends the offer summary automatically.
            </p>
            {existing?.releasedBy ? (
              <p className="mt-1 text-gray-600">
                Released by {existing.releasedBy.name} ({existing.releasedBy.email})
              </p>
            ) : null}
          </div>

          <Field label="2 · Position / designation">
            <TextInput
              value={positionTitle}
              disabled={lockMainFields}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder="e.g. Full Stack Engineer"
            />
          </Field>

          <Field label="Compensation package">
            <TextInput
              value={compensation}
              disabled={lockMainFields}
              onChange={(e) => setCompensation(e.target.value)}
              placeholder="e.g. 10 LPA"
            />
          </Field>

          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">3 · Important dates</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Joining date">
              <TextInput
                type="date"
                value={joiningDate}
                disabled={lockMainFields}
                onChange={(e) => setJoiningDate(e.target.value)}
              />
            </Field>
            <Field label="Offer valid until">
              <TextInput
                type="date"
                value={validUntil}
                disabled={lockMainFields}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </Field>
          </div>

          <Field label="4 · Terms & conditions">
            <Textarea
              rows={3}
              value={terms}
              disabled={lockMainFields}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Probation, notice period, benefits, legal terms."
            />
          </Field>

          <Field label="5 · Letter to candidate">
            <Textarea
              rows={8}
              value={letterContent}
              disabled={lockMainFields}
              onChange={(e) => setLetterContent(e.target.value)}
              placeholder={`Dear ${candidateName ?? 'candidate'},\n\n...`}
            />
          </Field>

          {isReleased && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {isAccepted
                ? 'Candidate accepted.'
                : isDeclined
                  ? 'Candidate not interested.'
                  : 'Offer released. Core fields are locked.'}
            </div>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" disabled={savingDraft || lockMainFields} onClick={() => void handleSaveDraft()}>
            {savingDraft ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button type="button" variant="primary" disabled={releasing || lockMainFields} onClick={() => void handleRelease()}>
            {releasing ? 'Releasing…' : 'Release Offer'}
          </Button>
        </div>
      </div>
    </div>
  );
}
