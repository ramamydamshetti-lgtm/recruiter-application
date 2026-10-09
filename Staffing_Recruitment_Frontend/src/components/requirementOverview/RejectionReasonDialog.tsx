'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function RejectionReasonDialog({ open, title = 'Rejection reason', onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-600">A reason is required when marking a candidate as rejected.</p>
        <div className="mt-4">
          <Field label="Reason">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Share concise feedback for audit…"
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!reason.trim()}
            onClick={async () => {
              await onConfirm(reason.trim());
              setReason('');
            }}
          >
            Confirm reject
          </Button>
        </div>
      </div>
    </div>
  );
}
