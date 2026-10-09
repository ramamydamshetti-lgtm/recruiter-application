import { escapeHtml } from './escape';
import { APP_PRODUCT_NAME, COMPANY_NAME } from './branding';

const brand = {
  primary: '#1e3a5f',
  accent: '#7c2d3a',
  text: '#0f172a',
  muted: '#64748b',
  bg: '#f4f6fb',
};

function layout(inner: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:24px;background:${brand.bg};font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${brand.text};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:28px 28px 8px;border-bottom:2px solid ${brand.accent};">
        <div style="font-size:20px;font-weight:700;color:${brand.primary};letter-spacing:-0.02em;">${APP_PRODUCT_NAME}</div>
        <div style="font-size:12px;color:${brand.muted};margin-top:6px;">${COMPANY_NAME}</div>
      </td>
    </tr>
    <tr><td style="padding:8px 28px 28px;">${inner}</td></tr>
    <tr>
      <td style="padding:16px 28px;background:#f1f5f9;font-size:12px;color:${brand.muted};line-height:1.5;">
        This message was sent by ${APP_PRODUCT_NAME}. If you did not expect it, you can ignore this email.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function welcomeTemplate(firstName: string, loginUrl: string): string {
  const name = escapeHtml(firstName);
  const url = escapeHtml(loginUrl);
  return layout(`
    <h1 style="margin:0 0 12px;font-size:22px;">Welcome, ${name}</h1>
    <p style="margin:0 0 16px;line-height:1.6;color:${brand.text};">Your recruiter account is ready. Sign in with your password or request a one-time code sent to this inbox.</p>
    <p style="margin:0 0 20px;line-height:1.6;color:${brand.muted};font-size:14px;">Tip: If you don’t see this email, check your <strong>Junk Email</strong> folder in Outlook.</p>
    <a href="${url}" style="display:inline-block;background:${brand.primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Go to sign in</a>
  `);
}

export function loginCodeTemplate(firstName: string, code: string, minutesValid: number): string {
  const name = escapeHtml(firstName);
  const c = escapeHtml(code);
  return layout(`
    <h1 style="margin:0 0 12px;font-size:22px;">Your sign-in code</h1>
    <p style="margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 20px;line-height:1.6;">Use this code to complete sign-in to ${APP_PRODUCT_NAME}:</p>
    <div style="text-align:center;margin:24px 0;padding:20px;background:#f1f5f9;border-radius:8px;letter-spacing:8px;font-size:28px;font-weight:700;color:${brand.primary};">${c}</div>
    <p style="margin:0;font-size:14px;color:${brand.muted};">This code expires in ${minutesValid} minutes. Do not share it with anyone.</p>
  `);
}

export function passwordResetTemplate(resetUrl: string): string {
  const url = escapeHtml(resetUrl);
  return layout(`
    <h1 style="margin:0 0 12px;font-size:22px;">Reset your password</h1>
    <p style="margin:0 0 20px;line-height:1.6;">We received a request to reset your password. Click the button below to choose a new one.</p>
    <a href="${url}" style="display:inline-block;background:${brand.primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Reset password</a>
    <p style="margin:24px 0 0;font-size:12px;color:${brand.muted};word-break:break-all;">${url}</p>
    <p style="margin:12px 0 0;font-size:12px;color:${brand.muted};">If you didn’t ask for this, you can ignore this email.</p>
  `);
}

export function verifyEmailTemplate(verifyUrl: string): string {
  const url = escapeHtml(verifyUrl);
  return layout(`
    <h1 style="margin:0 0 12px;font-size:22px;">Verify your email</h1>
    <p style="margin:0 0 20px;line-height:1.6;">Please confirm your email address for ${APP_PRODUCT_NAME}.</p>
    <a href="${url}" style="display:inline-block;background:${brand.primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Verify email</a>
    <p style="margin:24px 0 0;font-size:12px;color:${brand.muted};word-break:break-all;">${url}</p>
  `);
}

export function securityAlertTemplate(details: { ip?: string; userAgent?: string }): string {
  const ip = escapeHtml(details.ip ?? 'Unknown');
  const ua = escapeHtml(details.userAgent ?? 'Unknown');
  return layout(`
    <h1 style="margin:0 0 12px;font-size:22px;">New sign-in</h1>
    <p style="margin:0 0 12px;">We noticed a sign-in to your account.</p>
    <ul style="margin:0;padding-left:20px;color:${brand.muted};font-size:14px;">
      <li>Time: ${escapeHtml(new Date().toISOString())}</li>
      <li>IP: ${ip}</li>
      <li>Device: ${ua}</li>
    </ul>
  `);
}

export type InterviewNotificationKind = 'scheduled' | 'rescheduled' | 'reminder' | 'cancelled';

export type InterviewNotificationDetails = {
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

export type InterviewRecruiterSignature = {
  name: string;
  title: string;
  email: string;
  phone?: string | null;
};

export function interviewNotificationTemplate(
  candidateName: string,
  details: InterviewNotificationDetails,
  recruiter: InterviewRecruiterSignature,
): string {
  const name = escapeHtml(candidateName);
  const recruiterName = escapeHtml(recruiter.name);
  const recruiterTitle = escapeHtml(recruiter.title);
  const recruiterEmailText = escapeHtml(recruiter.email);
  const recruiterMailto = encodeURIComponent(recruiter.email);
  const company = escapeHtml(COMPANY_NAME);
  const telRaw = (recruiter.phone || '').trim();
  const telHref = telRaw ? `tel:${telRaw.replace(/[^\d+]/g, '')}` : '';
  const kind = details.kind ?? 'scheduled';

  const intro: Record<InterviewNotificationKind, string> = {
    scheduled: 'Your interview has been scheduled. Please review the details below.',
    rescheduled: 'Your interview has been rescheduled. Updated details are below.',
    reminder: 'This is a friendly reminder about your upcoming interview.',
    cancelled: 'There is an update regarding your interview. Please see the details below.',
  };

  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;width:38%;color:${brand.muted};font-size:14px;">${label}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:14px;">${value}</td></tr>`;

  const rows: string[] = [];
  if (details.jobTitle) rows.push(row('Role / job', escapeHtml(details.jobTitle)));
  if (details.clientName) rows.push(row('Client', escapeHtml(details.clientName)));
  rows.push(row('Round', escapeHtml(details.round)));
  rows.push(row('Date', escapeHtml(details.date)));
  rows.push(row('Time', escapeHtml(details.time)));
  rows.push(row('Mode', escapeHtml(details.mode)));
  if (details.status) rows.push(row('Status', escapeHtml(details.status)));
  if (details.location) rows.push(row('Location', escapeHtml(details.location)));
  if (details.meetingLink) {
    const link = escapeHtml(details.meetingLink);
    rows.push(
      `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;color:${brand.muted};font-size:14px;">Meeting link</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:14px;"><a href="${link}" style="color:${brand.primary};word-break:break-all;">${link}</a></td></tr>`,
    );
  }
  if (details.notes) rows.push(row('Notes', escapeHtml(details.notes)));

  return layout(`
    <h1 style="margin:0 0 12px;font-size:22px;">Interview notification</h1>
    <p style="margin:0 0 8px;line-height:1.6;">Dear ${name},</p>
    <p style="margin:0 0 20px;line-height:1.6;color:${brand.text};">${intro[kind]}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 24px;">
      <tbody>${rows.join('')}</tbody>
    </table>
    <p style="margin:0 0 8px;line-height:1.6;font-size:14px;">Please confirm you received this message. If anything looks incorrect, reply to this email.</p>
    <p style="margin:16px 0 4px;line-height:1.6;font-size:14px;color:${brand.text};">Regards,</p>
    <p style="margin:0;line-height:1.55;font-size:14px;color:${brand.text};">
      <strong>${recruiterName}</strong><br/>
      <em style="color:#334155;">${recruiterTitle}</em><br/>
      <em style="color:#334155;">${company}</em>
    </p>
    <p style="margin:10px 0 0;line-height:1.6;font-size:13px;">
      <strong>Email:</strong> <a href="mailto:${recruiterMailto}" style="color:${brand.primary};">${recruiterEmailText}</a>
    </p>
    ${
      telRaw
        ? `<p style="margin:6px 0 0;line-height:1.6;font-size:13px;">
      <strong>Phone:</strong> ${
        telHref
          ? `<a href="${escapeHtml(telHref)}" style="color:${brand.primary};">${escapeHtml(telRaw)}</a>`
          : escapeHtml(telRaw)
      }
    </p>`
        : ''
    }
  `);
}

export function interviewNotificationSubject(
  details: InterviewNotificationDetails,
): string {
  const kind = details.kind ?? 'scheduled';
  const round = details.round || 'Interview';
  const job = details.jobTitle ? ` — ${details.jobTitle}` : '';
  switch (kind) {
    case 'rescheduled':
      return `Interview rescheduled (${round})${job}`;
    case 'reminder':
      return `Reminder: interview (${round})${job}`;
    case 'cancelled':
      return `Interview update (${round})${job}`;
    default:
      return `Interview scheduled (${round})${job}`;
  }
}

export type OfferLetterEmailDetails = {
  positionTitle: string | null;
  compensation: string | null;
  joiningDate: Date | null;
  validUntil: Date | null;
  terms: string | null;
  letterContent: string | null;
  clientName: string | null;
  roleTitle: string | null;
  releasedByName?: string | null;
};

function formatOfferDate(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** HTML body for the candidate when an offer letter is released (SMTP / Graph). */
export function offerLetterReleasedEmailHtml(
  candidateName: string,
  details: OfferLetterEmailDetails,
): string {
  const name = escapeHtml(candidateName);

  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;width:38%;color:${brand.muted};font-size:14px;">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:14px;">${value}</td></tr>`;

  const rows: string[] = [];
  if (details.roleTitle?.trim()) rows.push(row('Role', escapeHtml(details.roleTitle.trim())));
  if (details.clientName?.trim()) rows.push(row('Client', escapeHtml(details.clientName.trim())));
  const pos = details.positionTitle?.trim();
  if (pos) rows.push(row('Position offered', escapeHtml(pos)));
  if (details.compensation?.trim()) rows.push(row('Compensation', escapeHtml(details.compensation.trim())));
  const jd = formatOfferDate(details.joiningDate);
  if (jd) rows.push(row('Expected joining', escapeHtml(jd)));
  const vu = formatOfferDate(details.validUntil);
  if (vu) rows.push(row('Offer valid until', escapeHtml(vu)));

  const parts: string[] = [];
  parts.push(`<h1 style="margin:0 0 12px;font-size:22px;">Your formal offer</h1>`);
  parts.push(
    `<p style="margin:0 0 16px;line-height:1.6;">Dear ${name},</p>`,
  );
  parts.push(
    `<p style="margin:0 0 20px;line-height:1.6;color:${brand.text};">We are pleased to share your offer details below. Please read carefully and reply to this email if you have questions.</p>`,
  );
  if (rows.length) {
    parts.push(
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 24px;"><tbody>${rows.join('')}</tbody></table>`,
    );
  }
  if (details.terms?.trim()) {
    parts.push(`<h2 style="margin:24px 0 8px;font-size:16px;">Terms &amp; conditions</h2>`);
    parts.push(
      `<div style="white-space:pre-wrap;line-height:1.55;font-size:14px;color:${brand.text};">${escapeHtml(details.terms.trim())}</div>`,
    );
  }
  if (details.letterContent?.trim()) {
    parts.push(`<h2 style="margin:24px 0 8px;font-size:16px;">Offer letter</h2>`);
    parts.push(
      `<div style="white-space:pre-wrap;line-height:1.55;font-size:14px;color:${brand.text};">${escapeHtml(details.letterContent.trim())}</div>`,
    );
  }
  if (details.releasedByName?.trim()) {
    const rb = escapeHtml(details.releasedByName.trim());
    parts.push(
      `<p style="margin:24px 0 0;line-height:1.6;font-size:14px;color:${brand.muted};">— ${rb}<br/><span style="font-size:12px;">${COMPANY_NAME}</span></p>`,
    );
  } else {
    parts.push(
      `<p style="margin:24px 0 0;line-height:1.6;font-size:14px;color:${brand.muted};">— ${COMPANY_NAME}</p>`,
    );
  }

  return layout(parts.join(''));
}
