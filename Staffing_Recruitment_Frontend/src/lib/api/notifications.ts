import { getPublicApiBase } from '@/lib/publicOrigin';

/** Browser: same-origin when env unset; else public HTTPS origin. Server: backend URL for SSR. */
function apiBase(): string {
  return getPublicApiBase();
}

export type InterviewNotificationKind = 'scheduled' | 'rescheduled' | 'reminder' | 'cancelled';

export type InterviewNotificationPayload = {
  candidateEmail: string;
  candidateName: string;
  jobTitle?: string;
  clientName?: string;
  round: string;
  date: string;
  time: string;
  mode: string;
  status?: string;
  location?: string;
  meetingLink?: string;
  notes?: string;
  kind?: InterviewNotificationKind;
};

export type ClientSubmissionEmailRecipientResult = {
  to: string;
  ok: boolean;
  error?: string;
  mode?: string;
};

export async function sendClientSubmissionEmailApi(input: {
  /** Single recipient (legacy). */
  clientEmail?: string;
  /** Optional legacy reference recipients. Current backend replies to the original requirement thread. */
  clientEmails?: string[];
  submissionDestination?: 'lead' | 'client';
  submitToLead?: boolean;
  forwardToClientLoop?: boolean;
  /** Lead: send lead review email AND reply in client thread (one submission, not two). */
  alsoForwardToClientThread?: boolean;
  confirmClientThread?: boolean;
  requirementId: string;
  candidateIds: string[];
  /** Selected client on Submission to Client (preset slug, e.g. `itc`, `kpmg`, `other-custom`). */
  submittingToClient?: string;
  /** Required when submittingToClient is `other-custom`. */
  customClientName?: string;
  /** Client-specific tracker payload for Excel attachment. */
  clientTracker?: {
    client:
      | 'itc'
      | 'kpmg'
      | 'ust'
      | 'ltts'
      | 'accenture'
      | 'metaforge'
      | 'brillio'
      | 'happiest-minds'
      | 'other-custom';
    customClientName?: string;
    rows: Array<Record<string, string>>;
  };
  /** Optional render override for email tracker (extra columns + custom header color). */
  clientTrackerRenderOverride?: {
    headers: string[];
    rows: Array<Record<string, string>>;
    styles?: {
      headerBgColor?: string;
    };
  };
  threadToRecipients?: string[];
  threadCcRecipients?: string[];
  threadBccRecipients?: string[];
  /** Optional reply subject; defaults to original requirement email subject. Threading is preserved via Graph reply. */
  threadSubject?: string;
  /** Optional recruiter signature override from My Work basic info. */
  recruiterSignature?: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
  };
  /** Auto or edited greeting line (e.g. "Dear Vinaya,"). */
  emailGreeting?: string;
  /** Introduction paragraphs (plain text, blank-line separated). */
  emailIntroduction?: string;
  /** Display names for To recipients keyed by lowercase email. */
  threadToRecipientNames?: Record<string, string>;
}): Promise<{
  recipients: ClientSubmissionEmailRecipientResult[];
  attachmentCount?: number;
  partialFailures?: ClientSubmissionEmailRecipientResult[];
  dryRun?: boolean;
  thread?: {
    graphMessageId?: string;
    mailbox?: string;
    subject?: string;
  };
}> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) {
    throw new Error('You must be signed in to send email from the application.');
  }

  const fromArray = (input.clientEmails?.map((e) => e.trim()).filter(Boolean) ?? []).filter(Boolean);
  const fromList =
    fromArray.length > 0
      ? fromArray
      : input.clientEmail?.trim()
        ? [input.clientEmail.trim()]
        : [];
  const primary = fromList[0] ?? '';

  const response = await fetch(`${apiBase()}/api/notifications/client-submission-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      // Legacy servers / validators often only read `clientEmail` — always send primary here too.
      clientEmail: primary,
      clientEmails: fromList,
      submissionDestination: input.submissionDestination ?? 'lead',
      ...(typeof input.submitToLead === 'boolean' ? { submitToLead: input.submitToLead } : {}),
      ...(typeof input.forwardToClientLoop === 'boolean'
        ? { forwardToClientLoop: input.forwardToClientLoop }
        : {}),
      ...(input.alsoForwardToClientThread ? { alsoForwardToClientThread: true } : {}),
      ...(input.confirmClientThread ? { confirmClientThread: true } : {}),
      requirementId: input.requirementId,
      candidateIds: input.candidateIds,
      ...(input.threadToRecipients?.length ? { threadToRecipients: input.threadToRecipients } : {}),
      ...(input.threadCcRecipients?.length ? { threadCcRecipients: input.threadCcRecipients } : {}),
      ...(input.threadBccRecipients?.length ? { threadBccRecipients: input.threadBccRecipients } : {}),
      ...(input.threadSubject?.trim() ? { threadSubject: input.threadSubject.trim() } : {}),
      ...(input.submittingToClient?.trim()
        ? { submittingToClient: input.submittingToClient.trim() }
        : {}),
      ...(input.customClientName?.trim() ? { customClientName: input.customClientName.trim() } : {}),
      ...(input.clientTracker ? { clientTracker: input.clientTracker } : {}),
      ...(input.clientTrackerRenderOverride
        ? { clientTrackerRenderOverride: input.clientTrackerRenderOverride }
        : {}),
      ...(input.recruiterSignature ? { recruiterSignature: input.recruiterSignature } : {}),
      ...(input.emailGreeting?.trim() ? { emailGreeting: input.emailGreeting.trim() } : {}),
      ...(input.emailIntroduction?.trim() ? { emailIntroduction: input.emailIntroduction.trim() } : {}),
      ...(input.threadToRecipientNames && Object.keys(input.threadToRecipientNames).length
        ? { threadToRecipientNames: input.threadToRecipientNames }
        : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const p = payload as {
      message?: string;
      data?: Array<{ candidateName?: string; missingFields?: string[] }>;
    };
    const base = p.message || `Failed to send client email (${response.status})`;
    if (Array.isArray(p.data) && p.data.length > 0) {
      const lines = p.data
        .map((row) =>
          row.candidateName && row.missingFields?.length
            ? `${row.candidateName}: ${row.missingFields.join(', ')}`
            : '',
        )
        .filter(Boolean);
      if (lines.length) {
        throw new Error(`${base}\n${lines.join('\n')}`);
      }
    }
    throw new Error(base);
  }

  const data = (payload as { data?: Record<string, unknown> }).data ?? {};
  return {
    recipients: (data.recipients as ClientSubmissionEmailRecipientResult[]) ?? [],
    attachmentCount: data.attachmentCount as number | undefined,
    partialFailures: data.partialFailures as ClientSubmissionEmailRecipientResult[] | undefined,
    dryRun: data.dryRun as boolean | undefined,
    thread: data.thread as
      | { graphMessageId?: string; mailbox?: string; subject?: string }
      | undefined,
  };
}

export async function sendInterviewNotificationEmail(
  payload: InterviewNotificationPayload,
): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) {
    throw new Error('You must be signed in to send email from the application.');
  }

  const response = await fetch(`${apiBase()}/api/notifications/interview-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message || `Failed to send email (${response.status})`,
    );
  }
}
