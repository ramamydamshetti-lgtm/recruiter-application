import type { EmailRecipient } from './transport';

/** Recruiter identity stamped on client submission emails (display name + reply routing). */
export type SubmissionSenderIdentity = {
  displayName: string;
  replyToEmail: string;
};

export function buildSubmissionSenderIdentity(input: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  displayNameOverride?: string;
}): SubmissionSenderIdentity {
  const displayName =
    input.displayNameOverride?.trim() ||
    [input.firstName, input.lastName].filter(Boolean).join(' ').trim() ||
    input.email;
  return {
    displayName,
    replyToEmail: input.email.trim(),
  };
}

/** Graph `from` on shared mailbox — address stays mailbox; name shows recruiter in Outlook. */
export function graphSubmissionFromRecipient(
  mailbox: string,
  sender: SubmissionSenderIdentity,
): { emailAddress: { address: string; name: string } } {
  return {
    emailAddress: {
      address: mailbox.trim(),
      name: sender.displayName,
    },
  };
}

export function graphSubmissionReplyToRecipients(
  sender: SubmissionSenderIdentity,
): Array<{ emailAddress: { address: string; name: string } }> {
  return [
    {
      emailAddress: {
        address: sender.replyToEmail,
        name: sender.displayName,
      },
    },
  ];
}

/** Ensure submitting recruiter is on CC for Reply All while avoiding duplicates. */
export function mergeRecruiterIntoCcRecipients(
  cc: EmailRecipient[] | undefined,
  sender: SubmissionSenderIdentity,
  mailbox: string,
): EmailRecipient[] {
  const seen = new Set<string>();
  const out: EmailRecipient[] = [];
  const mailboxKey = mailbox.trim().toLowerCase();

  const add = (r: EmailRecipient) => {
    const addr = String(r.address ?? '').trim();
    if (!addr) return;
    const key = addr.toLowerCase();
    if (key === mailboxKey || seen.has(key)) return;
    seen.add(key);
    out.push({ address: addr, name: r.name });
  };

  for (const r of cc ?? []) add(r);
  add({ address: sender.replyToEmail, name: sender.displayName });
  return out;
}

export function formatSmtpSubmissionFrom(mailbox: string, sender: SubmissionSenderIdentity): string {
  const safeName = sender.displayName.replace(/"/g, '');
  return `"${safeName}" <${mailbox}>`;
}
