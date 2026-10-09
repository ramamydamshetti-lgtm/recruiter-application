'use client';

import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { InterviewRecord } from '@/lib/api/interviews';
import { updateInterview } from '@/lib/api/interviews';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { formatDateTime } from '@/lib/utils/dateTime';
import { sendInterviewNotificationEmail } from '@/lib/api/notifications';
import { notify } from '@/lib/notify';
import { useAuth } from '@/lib/contexts/AuthContext';

type Props = {
  open: boolean;
  onClose: () => void;
  submissionId: string | null;
  interviews: InterviewRecord[];
  onDone: () => void;
};

export function RescheduleDrawer({ open, onClose, submissionId, interviews, onDone }: Props) {
  const { currentUser } = useAuth();
  const rows = useMemo(
    () =>
      submissionId ? interviews.filter((i) => i.submissionId === submissionId && i.status !== 'Cancelled') : [],
    [interviews, submissionId],
  );
  const [interviewId, setInterviewId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (rows[0]?.id) setInterviewId(rows[0].id);
  }, [rows]);

  if (!open) return null;

  const selectedInterview = rows.find((r) => r.id === interviewId) ?? rows[0] ?? null;

  const sendInterviewWhatsApp = () => {
    const phone = selectedInterview?.candidate.phone ?? '';
    if (!phone) return;
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    const whatsappUrl = cleanPhone.startsWith('+')
      ? `https://wa.me/${cleanPhone.substring(1)}`
      : `https://wa.me/91${cleanPhone}`;
    const message = encodeURIComponent(
      `Dear ${selectedInterview?.candidate.name ?? 'Candidate'},\n\n` +
      `Your interview has been rescheduled:\n\n` +
      `Date: ${date}\n` +
      `Time: ${time}\n` +
      `Round: ${selectedInterview?.round ?? 'Interview'}\n` +
      `Mode: ${selectedInterview?.mode ?? 'Online'}\n` +
      `${selectedInterview?.meetingLink ? `Meeting: ${selectedInterview.meetingLink}\n` : ''}` +
      `Best regards,\n${currentUser?.name || 'Recruitment Team'}`,
    );
    window.open(`${whatsappUrl}?text=${message}`, '_blank');
  };

  const handleSave = async () => {
    if (!interviewId || !date || !time) return;
    setSaving(true);
    setError(null);
    try {
      const iso = new Date(`${date}T${time}:00`).toISOString();
      const prev = selectedInterview;
      await updateInterview(interviewId, {
        scheduledAt: iso,
        status: 'Rescheduled',
        notes: `${prev?.notes ?? ''}\nRescheduled via command center`.trim(),
      });
      if (sendEmail && prev?.candidate.email) {
        await sendInterviewNotificationEmail({
          candidateEmail: prev.candidate.email,
          candidateName: prev.candidate.name,
          jobTitle: prev.requirement.roleTitle,
          clientName: prev.requirement.clientName,
          round: prev.round,
          date,
          time,
          mode: prev.mode,
          status: 'Rescheduled',
          meetingLink: prev.meetingLink ?? undefined,
          notes: `Rescheduled interview. ${prev?.notes ?? ''}`.trim(),
          kind: 'rescheduled',
        });
      }
      if (sendWhatsApp) sendInterviewWhatsApp();
      onDone();
      onClose();
      notify.success('Interview updated successfully.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not reschedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close backdrop" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-900">Reschedule interview</div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-4 py-4">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-600">No interviews to reschedule.</p>
          ) : (
            <>
              <Field label="Interview">
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={interviewId}
                  onChange={(e) => setInterviewId(e.target.value)}
                >
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.round} — {formatDateTime(r.scheduledAt)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="New date">
                  <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="New time">
                  <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </Field>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
                <div><strong>Candidate Email:</strong> {selectedInterview?.candidate.email || '—'}</div>
                <div className="mt-1"><strong>Candidate Phone:</strong> {selectedInterview?.candidate.phone || '—'}</div>
              </div>
              <div className="border-t pt-3">
                <div className="mb-2 text-sm font-medium text-gray-900">Send Interview Schedule</div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Send via Email</span>
                </label>
                <label className="mt-2 flex items-center">
                  <input
                    type="checkbox"
                    checked={sendWhatsApp}
                    onChange={(e) => setSendWhatsApp(e.target.checked)}
                    className="mr-2 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">Send via WhatsApp</span>
                </label>
              </div>
            </>
          )}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={saving || rows.length === 0 || !date}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
