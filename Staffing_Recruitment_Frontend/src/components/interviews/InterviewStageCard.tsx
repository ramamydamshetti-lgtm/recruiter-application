import React from 'react';

export type InterviewStatus = 'Scheduled' | 'Cleared' | 'Rejected' | 'On Hold';

type InterviewStageCardProps = {
  stageLabel: string;
  date: string;
  time: string;
  status: InterviewStatus;
  email: string;
  phone: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onStatusChange: (value: InterviewStatus) => void;
  onEmailChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSendEmail: () => void;
  onSendWhatsApp: () => void;
  onSendNotification: () => void;
};

export const InterviewStageCard: React.FC<InterviewStageCardProps> = ({
  stageLabel,
  date,
  time,
  status,
  email,
  phone,
  onDateChange,
  onTimeChange,
  onStatusChange,
  onEmailChange,
  onPhoneChange,
  onSendEmail,
  onSendWhatsApp,
  onSendNotification,
}) => {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{stageLabel} Interview</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Track schedule, status, and communication for this round.
          </p>
        </div>
        <div className="shrink-0">
          <label className="block text-xs font-medium text-gray-500">Status</label>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as InterviewStatus)}
            className="mt-1 h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="Scheduled">Scheduled</option>
            <option value="Cleared">Cleared</option>
            <option value="Rejected">Rejected</option>
            <option value="On Hold">On Hold</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-500">Interview Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="mt-1 h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-500">Interview Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="mt-1 h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-end">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500">Email</label>
            <input
              type="email"
              placeholder="candidate@example.com"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className="mt-1 h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button
            type="button"
            onClick={onSendEmail}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Send Email
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-end">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500">WhatsApp Number</label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              className="mt-1 h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button
            type="button"
            onClick={onSendWhatsApp}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Send WhatsApp
          </button>
        </div>
      </div>

      <div className="border-t border-dashed border-gray-200 pt-3">
        <button
          type="button"
          onClick={onSendNotification}
          className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-gray-900 bg-gray-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-black"
        >
          Send Notification (Email + WhatsApp)
        </button>
      </div>
    </div>
  );
};

