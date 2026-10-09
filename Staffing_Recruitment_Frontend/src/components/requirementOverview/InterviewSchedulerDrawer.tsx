'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput, Textarea } from '@/components/ui/Field';
import { createInterview } from '@/lib/api/interviews';
import type { Submission } from '@/lib/domain/submissions/types';
import { sendInterviewNotificationEmail, type InterviewNotificationKind } from '@/lib/api/notifications';
import { useAuth } from '@/lib/contexts/AuthContext';
import { notify } from '@/lib/notify';

type Props = {
  open: boolean;
  onClose: () => void;
  submissions: Submission[];
  initialSubmissionId: string | null;
  initialRound?: 'L1' | 'L2' | 'Final';
  onScheduled: () => void;
};

function mapModeToUi(mode: string): 'Online' | 'Offline' | 'Hybrid' {
  if (mode === 'In-person') return 'Offline';
  if (mode === 'Phone') return 'Hybrid';
  return 'Online';
}

function modeToNotificationMode(mode: 'Online' | 'Offline' | 'Hybrid'): string {
  return mode;
}

function mapStatusToKind(status: string): InterviewNotificationKind {
  if (status === 'Rescheduled') return 'rescheduled';
  if (status === 'Cancelled') return 'cancelled';
  return 'scheduled';
}

export function InterviewSchedulerDrawer({
  open,
  onClose,
  submissions,
  initialSubmissionId,
  initialRound = 'L1',
  onScheduled,
}: Props) {
  const { currentUser } = useAuth();
  const [submissionId, setSubmissionId] = useState('');
  const [round, setRound] = useState('L1');
  const [mode, setMode] = useState<'Online' | 'Offline' | 'Hybrid'>('Online');
  const [status] = useState<'Scheduled'>('Scheduled');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [meetingLink, setMeetingLink] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubmissionId(initialSubmissionId ?? '');
    setRound(initialRound);
    setMode('Online');
    setDate('');
    setTime('10:00');
    setCandidateEmail('');
    setCandidatePhone('');
    setSendEmail(false);
    setSendWhatsApp(false);
    setMeetingLink('');
    setNotes('');
    setError(null);
  }, [open, initialSubmissionId, initialRound]);

  const selectedSubmission = useMemo(
    () => submissions.find((s) => s.id === submissionId) ?? null,
    [submissions, submissionId],
  );

  useEffect(() => {
    if (!selectedSubmission) {
      setCandidateEmail('');
      setCandidatePhone('');
      return;
    }
    const email = selectedSubmission.candidate.email ?? '';
    const phone = selectedSubmission.candidate.phone ?? '';
    setCandidateEmail(email);
    setCandidatePhone(phone);
    setSendEmail(Boolean(email && email !== 'unknown@email.com'));
  }, [selectedSubmission]);

  const canSave = useMemo(() => Boolean(submissionId && date && time), [submissionId, date, time]);

  if (!open) return null;

  const sendInterviewWhatsApp = () => {
    if (!candidatePhone || !selectedSubmission) return;
    const cleanPhone = candidatePhone.replace(/[\s\-\(\)]/g, '');
    const whatsappUrl = cleanPhone.startsWith('+')
      ? `https://wa.me/${cleanPhone.substring(1)}`
      : `https://wa.me/91${cleanPhone}`;
    const message = encodeURIComponent(
      `Dear ${selectedSubmission.candidate.name},\n\n` +
      `Your interview has been scheduled:\n\n` +
      `Date: ${date}\n` +
      `Time: ${time}\n` +
      `Round: ${round}\n` +
      `Mode: ${mode}\n` +
      `${meetingLink ? `Meeting: ${meetingLink}\n` : ''}` +
      `${notes ? `Notes: ${notes}\n` : ''}\n` +
      `Best regards,\n${currentUser?.name || 'Recruitment Team'}`,
    );
    window.open(`${whatsappUrl}?text=${message}`, '_blank');
  };

  const handleSave = async () => {
    if (!submissionId || !date || !time) return;
    setSaving(true);
    setError(null);
    try {
      const iso = new Date(`${date}T${time}:00`).toISOString();
      await createInterview({
        submissionId,
        round,
        mode: mapModeToUi(mode),
        status,
        scheduledAt: iso,
        meetingLink: meetingLink.trim() || null,
        notes: notes.trim() || null,
      });
      if (selectedSubmission && sendEmail && candidateEmail && candidateEmail !== 'unknown@email.com') {
        await sendInterviewNotificationEmail({
          candidateEmail,
          candidateName: selectedSubmission.candidate.name,
          jobTitle: selectedSubmission.requirement.roleTitle,
          clientName: selectedSubmission.requirement.clientName,
          round,
          date,
          time,
          mode: modeToNotificationMode(mode),
          status,
          meetingLink: meetingLink.trim() || undefined,
          notes: notes.trim() || undefined,
          kind: mapStatusToKind(status),
        });
      }
      if (sendWhatsApp) {
        sendInterviewWhatsApp();
      }
      onScheduled();
      notify.success('Interview scheduled successfully.');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not schedule interview');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close backdrop" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule interview</div>
            <div className="text-sm font-semibold text-gray-900">
              {selectedSubmission?.candidate.name ?? 'Candidate'}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <Field label="Submission">
            <Select value={submissionId} onChange={(e) => setSubmissionId(e.target.value)}>
              <option value="">Select submission</option>
              {submissions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.candidate.name} - {s.requirement.roleTitle}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Interview Round">
            <Select value={round} onChange={(e) => setRound(e.target.value)}>
              <option value="L1">L1 - Technical Round</option>
              <option value="L2">L2 - Managerial Round</option>
              <option value="Final">Final - HR Round</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time">
              <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Interview Mode">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'Online' | 'Offline' | 'Hybrid')}>
              <option value="Online">Online</option>
              <option value="Offline">Offline</option>
              <option value="Hybrid">Hybrid</option>
            </Select>
          </Field>
          <Field label="Status">
            <TextInput value={status} readOnly />
          </Field>
          {(mode === 'Online' || mode === 'Hybrid') && (
            <Field label="Meeting Link (Optional)">
              <TextInput
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/xxx-xxx-xxx"
              />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Candidate Email">
              <TextInput
                type="email"
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                placeholder="candidate@email.com"
              />
            </Field>
            <Field label="Candidate Phone">
              <TextInput
                type="tel"
                value={candidatePhone}
                onChange={(e) => setCandidatePhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </Field>
          </div>
          <div className="border-t pt-4">
            <h4 className="mb-3 text-sm font-medium text-gray-900">Send Interview Schedule</h4>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Send via Email</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                  className="mr-2 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-gray-700">Send via WhatsApp</span>
              </label>
            </div>
          </div>
          <Field label="Notes">
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional interview details, requirements, etc."
            />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" disabled={!canSave || saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Schedule'}
          </Button>
        </div>
      </div>
    </div>
  );
}
