import dns from 'node:dns';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { assertSmtpCredentials, formatFromHeader, getMailConfig } from './config';
import {
  formatGraphErrorLabel,
  mailTransportLog,
  parseGraphErrorBody,
  summarizeSmtpAuthError,
} from './mailTransportLog';
import { recordOutboundCommunication, type MailLogPayload } from '@/services/communicationLogWriter';
import {
  formatSmtpSubmissionFrom,
  graphSubmissionFromRecipient,
  graphSubmissionReplyToRecipients,
  mergeRecruiterIntoCcRecipients,
} from './submissionSender';

// Graph thread replies fail when Node hangs on IPv6 / short connect timeouts.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // ignore
}

const GRAPH_HTTP_RETRIES = 4;

function isTransientGraphNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const cause =
    error && typeof error === 'object' && 'cause' in error
      ? String((error as { cause?: unknown }).cause ?? '')
      : '';
  const hay = `${msg} ${cause}`;
  return /UND_ERR_CONNECT_TIMEOUT|ConnectTimeoutError|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|network|AbortError/i.test(
    hay,
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch helper for Microsoft identity + Graph.
 * Prefers IPv4 (see setDefaultResultOrder) and retries transient connect timeouts
 * that otherwise break Forward-to-Client-Thread on this host.
 */
async function graphHttp(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= GRAPH_HTTP_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutMs = 45_000 + (attempt - 1) * 15_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const transient = isTransientGraphNetworkError(error);
      mailTransportLog('graph-http-error', {
        attempt,
        transient,
        timeoutMs,
        error: error instanceof Error ? error.message : String(error),
        urlHost: (() => {
          try {
            return new URL(url).host;
          } catch {
            return '(invalid-url)';
          }
        })(),
      });
      if (!transient || attempt >= GRAPH_HTTP_RETRIES) break;
      await sleep(500 * attempt * attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Graph HTTP request failed: ${String(lastError)}`);
}

/** Keep Outlook subject-based conversation grouping when leads edit the thread subject. */
export function formatGraphReplySubject(subject: string | undefined | null): string {
  const trimmed = String(subject ?? '').trim();
  if (!trimmed) return '';
  return /^(re|fw|fwd)\s*:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

export type MailAttachment = {
  /** Suggested filename for the recipient */
  filename: string;
  /** Local filesystem path (read and attached at send time) */
  path?: string;
  /** Inline bytes (alternative to path; e.g. generated XLSX) */
  content?: Buffer;
  /** Used when `content` is set (Graph + some SMTP setups). */
  contentType?: string;
  /** For inline images: matches `<img src="cid:...">` (SMTP `cid`; Graph `contentId`). */
  cid?: string;
};

export type MailSendOptions = {
  to: string;
  subject: string;
  html: string;
  /** Optional override; most providers use the authenticated sender mailbox. */
  from?: string;
  /** Reply-To header (e.g. submitting recruiter). */
  replyTo?: string;
  /** Optional attachments: server path and/or inline buffer per file. */
  attachments?: MailAttachment[];
  /** When MAIL_LOG_ENABLED=true, persists to communication_logs if set. */
  mailLog?: MailLogPayload & { subject?: string };
  /** Recruiter display name + reply routing for client submission emails. */
  submissionSender?: import('./submissionSender').SubmissionSenderIdentity;
};

export type EmailRecipient = {
  address: string;
  name?: string;
};

export type GraphReplyAllOptions = {
  mailbox?: string;
  messageId: string;
  html: string;
  attachments?: MailAttachment[];
  mailLog?: MailLogPayload & { subject?: string; recipient?: string };
  toRecipients?: EmailRecipient[];
  ccRecipients?: EmailRecipient[];
  bccRecipients?: EmailRecipient[];
  /** Optional reply subject override; threading is preserved via createReplyAll conversation. */
  replySubject?: string;
  /** Submitting recruiter — sets Outlook display name, Reply-To, and CC for Reply All. */
  submissionSender?: import('./submissionSender').SubmissionSenderIdentity;
};

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[e] || 'application/octet-stream';
}

let transporter: Transporter | null = null;

export function getTransporter(): Transporter {
  if (!transporter) {
    assertSmtpCredentials();
    const cfg = getMailConfig();
    const debug = process.env.SMTP_DEBUG === 'true' || process.env.SMTP_DEBUG === '1';
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.user,
        pass: cfg.pass,
      },
      requireTLS: cfg.port === 587,
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
      tls: {
        minVersion: 'TLSv1.2',
      },
      logger: debug,
      debug,
    });
  }
  return transporter;
}

export function resetTransporterForTests(): void {
  transporter = null;
}

function stripEnv(value: string | undefined): string {
  if (!value) return '';
  let s = value.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

function getMailProvider(): 'graph' | 'smtp' {
  const provider = stripEnv(process.env.MAIL_PROVIDER).toLowerCase();
  if (provider === 'graph' || provider === 'smtp') return provider;

  // auto: use graph if creds exist, otherwise smtp
  const tenantId = stripEnv(process.env.GRAPH_TENANT_ID);
  const clientId = stripEnv(process.env.GRAPH_CLIENT_ID);
  const clientSecret = stripEnv(process.env.GRAPH_CLIENT_SECRET);
  if (tenantId && clientId && clientSecret) return 'graph';

  return 'smtp';
}

function getGraphCreds() {
  return {
    tenantId: stripEnv(process.env.GRAPH_TENANT_ID),
    clientId: stripEnv(process.env.GRAPH_CLIENT_ID),
    clientSecret: stripEnv(process.env.GRAPH_CLIENT_SECRET),
  };
}

function getGraphFromUser(): string {
  // For sendMail, Graph needs the mailbox you will send from in the URL: /users/{from}/sendMail
  return (
    stripEnv(process.env.GRAPH_FROM_EMAIL) ||
    stripEnv(process.env.FROM_EMAIL) ||
    stripEnv(process.env.SMTP_USER) ||
    ''
  );
}

async function getGraphAccessToken(): Promise<string> {
  const { tenantId, clientId, clientSecret } = getGraphCreds();
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Graph is not configured: set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET in .env');
  }

  mailTransportLog('graph-token-request', {
    grantType: 'client_credentials',
    tenantIdPrefix: tenantId.slice(0, 8),
    clientIdPrefix: clientId.slice(0, 8),
    scope: 'https://graph.microsoft.com/.default',
  });

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const scope = 'https://graph.microsoft.com/.default';

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope,
    grant_type: 'client_credentials',
  });

  const res = await graphHttp(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    mailTransportLog('graph-token-failed', { httpStatus: res.status, body: text.slice(0, 400) });
    throw new Error(`Graph token request failed: ${res.status} ${text}`);
  }

  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    mailTransportLog('graph-token-failed', { reason: 'missing access_token in response' });
    throw new Error('Graph token response did not include access_token');
  }

  mailTransportLog('graph-token-acquired', {
    expiresInSeconds: json.expires_in ?? null,
    tokenLength: json.access_token.length,
  });

  return json.access_token;
}

async function verifyGraphConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const token = await getGraphAccessToken();
    if (!token) throw new Error('No access token');
    return { ok: true, message: 'Graph auth verified' };
  } catch (error) {
    return {
      ok: false,
      message: `Graph auth failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function verifySmtpConnectionInternal(): Promise<{ ok: boolean; message: string }> {
  try {
    assertSmtpCredentials();
    await getTransporter().verify();
    return { ok: true, message: 'SMTP connection verified' };
  } catch (error) {
    return {
      ok: false,
      message: `SMTP connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function verifySmtpConnection(): Promise<{ ok: boolean; message: string }> {
  const provider = getMailProvider();
  if (provider === 'graph') {
    return verifyGraphConnection();
  }
  return verifySmtpConnectionInternal();
}

const RETRY_DELAYS_MS = [300, 1000, 2000];
const MAX_RETRIES = 3;

function isGraphAccessDeniedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /403|401|ErrorAccessDenied|Access is denied/i.test(msg);
}

/**
 * SMTP fallback after Graph failures is opt-in (MAIL_GRAPH_FALLBACK_SMTP=true).
 * Default off so a broken SMTP password does not mask Graph permission issues with misleading 535 errors.
 */
function canFallbackGraphToSmtp(): boolean {
  const v = stripEnv(process.env.MAIL_GRAPH_FALLBACK_SMTP).toLowerCase();
  if (v !== 'true' && v !== '1' && v !== 'yes') return false;
  try {
    assertSmtpCredentials();
    return true;
  } catch {
    return false;
  }
}

function isGraphTokenError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /Graph token request failed|Graph token response did not include|invalid_client|unauthorized_client/i.test(
    msg,
  );
}

function formatThreadReplyFailureChain(steps: string[]): string {
  return (
    'Could not reply in the original requirement email thread. ' +
    steps.join(' | ') +
    ' | Fix: grant Microsoft Graph Application permission Mail.ReadWrite (for createReplyAll) and Mail.Send ' +
    'with admin consent on recruitment.application@metaforgeit.com, or enable working SMTP (MAIL_GRAPH_FALLBACK_SMTP=true).'
  );
}

async function sendMailViaGraph(options: MailSendOptions): Promise<void> {
  const token = await getGraphAccessToken();
  const fromUser = getGraphFromUser();
  if (!fromUser) {
    throw new Error('GRAPH_FROM_EMAIL (or FROM_EMAIL/SMTP_USER) is required for Graph sendMail');
  }

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromUser)}/sendMail`;
  const message: Record<string, unknown> = {
    subject: options.subject,
    body: {
      contentType: 'HTML',
      content: options.html,
    },
    toRecipients: [
      {
        emailAddress: {
          address: options.to,
        },
      },
    ],
  };

  if (options.submissionSender) {
    message.from = graphSubmissionFromRecipient(fromUser, options.submissionSender);
    message.replyTo = graphSubmissionReplyToRecipients(options.submissionSender);
    mailTransportLog('submission-sender', {
      displayName: options.submissionSender.displayName,
      replyTo: options.submissionSender.replyToEmail,
    });
  }

  if (options.attachments?.length) {
    message.attachments = options.attachments.map((att) => {
      let buf: Buffer;
      let contentType: string;
      if (att.content && att.content.length) {
        buf = att.content;
        contentType =
          att.contentType ||
          mimeFromExt(path.extname(att.filename || '') || '.bin');
      } else if (att.path) {
        buf = fs.readFileSync(att.path);
        contentType =
          att.contentType || mimeFromExt(path.extname(att.path));
      } else {
        throw new Error('MailAttachment requires path or content');
      }
      const row: Record<string, unknown> = {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType,
        contentBytes: buf.toString('base64'),
      };
      if (att.cid) {
        row.contentId = att.cid;
        row.isInline = true;
      }
      return row;
    });
  }

  const payload = {
    message,
    saveToSentItems: false,
  };

  const res = await graphHttp(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph sendMail failed: ${res.status} ${text}`);
  }
}

function attachmentToGraphFileAttachment(att: MailAttachment): Record<string, unknown> {
  let buf: Buffer;
  let contentType: string;
  if (att.content && att.content.length) {
    buf = att.content;
    contentType =
      att.contentType ||
      mimeFromExt(path.extname(att.filename || '') || '.bin');
  } else if (att.path) {
    buf = fs.readFileSync(att.path);
    contentType = att.contentType || mimeFromExt(path.extname(att.path));
  } else {
    throw new Error('MailAttachment requires path or content');
  }

  const row: Record<string, unknown> = {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: att.filename,
    contentType,
    contentBytes: buf.toString('base64'),
  };
  if (att.cid) {
    row.contentId = att.cid;
    row.isInline = true;
  }
  return row;
}

async function graphRequest(
  token: string,
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  const method = init.method || 'GET';
  const pathOnly = url.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '');
  mailTransportLog('graph-request', { label, method, path: pathOnly });

  const res = await graphHttp(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const parsed = parseGraphErrorBody(res.status, text);
    mailTransportLog('graph-response-error', {
      label,
      method,
      path: pathOnly,
      httpStatus: res.status,
      code: parsed.code,
      message: parsed.message,
    });
    throw new Error(formatGraphErrorLabel(parsed, `${label} failed`));
  }
  mailTransportLog('graph-response-ok', { label, method, path: pathOnly, httpStatus: res.status });
  return res;
}

function toGraphRecipients(recipients: EmailRecipient[] | undefined) {
  return (recipients ?? [])
    .map((r) => ({
      emailAddress: {
        address: String(r.address ?? '').trim(),
        ...(r.name?.trim() ? { name: r.name.trim() } : {}),
      },
    }))
    .filter((r) => r.emailAddress.address);
}

export type GraphMessageParticipants = {
  subject: string;
  to: EmailRecipient[];
  cc: EmailRecipient[];
  bcc: EmailRecipient[];
};

/** Find a mailbox message by subject (for manually created requirements linked by subject). */
function normalizeSubjectForMatch(value: string): string {
  return value
    .trim()
    .replace(/^(re|fw|fwd):\s*/gi, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export async function findGraphMessageBySubject(
  mailbox: string,
  subject: string,
): Promise<{ id: string; subject: string } | null> {
  const needle = subject.trim();
  if (!needle || !mailbox.trim()) return null;

  const token = await getGraphAccessToken();
  const escaped = needle.replace(/'/g, "''");
  const normNeedle = normalizeSubjectForMatch(needle);

  const pickBest = (
    rows: Array<{ id?: string; subject?: string; receivedDateTime?: string }>,
  ): { id: string; subject: string } | null => {
    const filtered = rows.filter((row) => String(row.id ?? '').trim());
    if (filtered.length === 0) return null;
    filtered.sort(
      (a, b) =>
        new Date(b.receivedDateTime ?? 0).getTime() - new Date(a.receivedDateTime ?? 0).getTime(),
    );
    const exact = filtered.find(
      (row) => normalizeSubjectForMatch(String(row.subject ?? '')) === normNeedle,
    );
    const best = exact ?? filtered[0]!;
    return {
      id: String(best.id).trim(),
      subject: String(best.subject ?? needle).trim(),
    };
  };

  const exactUrl =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
    `?$filter=${encodeURIComponent(`subject eq '${escaped}'`)}` +
    `&$top=10&$select=id,subject,receivedDateTime`;

  try {
    const res = await graphRequest(token, exactUrl, { method: 'GET' }, 'Graph find message by subject');
    const data = (await res.json()) as {
      value?: Array<{ id?: string; subject?: string; receivedDateTime?: string }>;
    };
    const found = pickBest(data.value ?? []);
    if (found) return found;
  } catch {
    // Fall through to recent-mailbox scan.
  }

  try {
    const recentUrl =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
      `?$top=150&$select=id,subject,receivedDateTime&$orderby=receivedDateTime desc`;
    const res = await graphRequest(token, recentUrl, { method: 'GET' }, 'Graph scan recent messages');
    const data = (await res.json()) as {
      value?: Array<{ id?: string; subject?: string; receivedDateTime?: string }>;
    };
    const rows = (data.value ?? []).filter((row) => {
      const subj = normalizeSubjectForMatch(String(row.subject ?? ''));
      return subj === normNeedle || subj.includes(normNeedle) || normNeedle.includes(subj);
    });
    return pickBest(rows);
  } catch {
    return null;
  }
}

/** Resolve a mailbox message by RFC Message-ID (internetMessageId) for resilient thread linking. */
export async function findGraphMessageByInternetMessageId(
  mailbox: string,
  internetMessageId: string,
): Promise<{ id: string; subject: string; internetMessageId: string } | null> {
  const needle = internetMessageId.trim();
  if (!needle || !mailbox.trim()) return null;

  const candidates = new Set<string>([needle]);
  if (!needle.startsWith('<') && !needle.endsWith('>')) {
    candidates.add(`<${needle}>`);
  }
  if (needle.startsWith('<') && needle.endsWith('>')) {
    candidates.add(needle.slice(1, -1));
  }

  const token = await getGraphAccessToken();
  for (const candidate of candidates) {
    const escaped = candidate.replace(/'/g, "''");
    const url =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
      `?$filter=${encodeURIComponent(`internetMessageId eq '${escaped}'`)}` +
      `&$top=5&$select=id,subject,internetMessageId,receivedDateTime`;
    try {
      const res = await graphRequest(
        token,
        url,
        { method: 'GET' },
        'Graph find message by internetMessageId',
      );
      const data = (await res.json()) as {
        value?: Array<{
          id?: string;
          subject?: string;
          internetMessageId?: string;
          receivedDateTime?: string;
        }>;
      };
      const rows = (data.value ?? [])
        .filter((row) => String(row.id ?? '').trim())
        .sort(
          (a, b) =>
            new Date(b.receivedDateTime ?? 0).getTime() - new Date(a.receivedDateTime ?? 0).getTime(),
        );
      const best = rows[0];
      if (best?.id) {
        return {
          id: String(best.id).trim(),
          subject: String(best.subject ?? '').trim(),
          internetMessageId: String(best.internetMessageId ?? candidate).trim(),
        };
      }
    } catch {
      // try next candidate form
    }
  }
  return null;
}

export async function fetchGraphMessageParticipants(
  mailbox: string,
  messageId: string,
): Promise<GraphMessageParticipants> {
  const token = await getGraphAccessToken();
  const baseUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}`;
  const url = `${baseUrl}?$select=subject,toRecipients,ccRecipients,bccRecipients,conversationId`;
  const res = await graphRequest(token, url, { method: 'GET' }, 'Graph get message participants');
  const data = (await res.json()) as {
    subject?: string;
    conversationId?: string;
    toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
    ccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
    bccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  };

  const mapList = (
    rows: Array<{ emailAddress?: { address?: string; name?: string } }> | undefined,
  ): EmailRecipient[] =>
    (rows ?? [])
      .map((row) => ({
        address: String(row.emailAddress?.address ?? '').trim(),
        name: row.emailAddress?.name?.trim() || undefined,
      }))
      .filter((r) => r.address);

  let subject = String(data.subject ?? '').trim();
  let to = mapList(data.toRecipients);
  let cc = mapList(data.ccRecipients);
  let bcc = mapList(data.bccRecipients);

  const conversationId = String(data.conversationId ?? '').trim();
  if (conversationId) {
    try {
      const convUrl =
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
        `?$filter=${encodeURIComponent(`conversationId eq '${conversationId.replace(/'/g, "''")}'`)}` +
        `&$orderby=receivedDateTime asc` +
        `&$top=1` +
        `&$select=subject,toRecipients,ccRecipients,bccRecipients`;
      const convRes = await graphRequest(token, convUrl, { method: 'GET' }, 'Graph get conversation root');
      const convJson = (await convRes.json()) as {
        value?: Array<{
          subject?: string;
          toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
          ccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
          bccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
        }>;
      };
      const root = convJson.value?.[0];
      if (root) {
        const rootTo = mapList(root.toRecipients);
        const rootCc = mapList(root.ccRecipients);
        const rootBcc = mapList(root.bccRecipients);
        if (!subject && root.subject) subject = String(root.subject).trim();
        to = mergeRecipientLists(to, rootTo);
        cc = mergeRecipientLists(cc, rootCc);
        bcc = mergeRecipientLists(bcc, rootBcc);
      }
    } catch {
      // Keep direct message participants when conversation lookup fails.
    }
  }

  return { subject, to, cc, bcc };
}

function mergeRecipientLists(a: EmailRecipient[], b: EmailRecipient[]): EmailRecipient[] {
  const seen = new Set<string>();
  const out: EmailRecipient[] = [];
  for (const list of [a, b]) {
    for (const row of list) {
      const address = String(row.address ?? '').trim();
      if (!address) continue;
      const key = address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ address, name: row.name });
    }
  }
  return out;
}

export async function sendGraphReplyAllToMessage(options: GraphReplyAllOptions): Promise<void> {
  const messageId = options.messageId.trim();
  const mailbox = (options.mailbox || getGraphFromUser()).trim();
  if (!mailbox) {
    throw new Error('GRAPH_FROM_EMAIL (or FROM_EMAIL/SMTP_USER) is required for Graph thread replies');
  }
  if (!messageId) {
    throw new Error('Original Graph message id is required for thread reply');
  }

  mailTransportLog('thread-reply-start', {
    mailbox,
    messageIdPrefix: messageId.slice(0, 24),
    toCount: options.toRecipients?.length ?? 0,
    ccCount: options.ccRecipients?.length ?? 0,
    smtpFallbackEnabled: canFallbackGraphToSmtp(),
  });

  const failureChain: string[] = [];

  try {
    await sendGraphReplyAllCore(options, mailbox, messageId);
    mailTransportLog('thread-reply-success', { method: 'createReplyAll', mailbox });
    return;
  } catch (error) {
    if (isGraphTokenError(error)) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    failureChain.push(`createReplyAll: ${msg}`);
    mailTransportLog('thread-reply-createReplyAll-failed', { error: msg });
  }

  try {
    await sendGraphThreadReplyViaSendMail(options, mailbox, messageId);
    mailTransportLog('thread-reply-success', { method: 'sendMail-fallback', mailbox });
    return;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    failureChain.push(`sendMail fallback: ${msg}`);
    mailTransportLog('thread-reply-sendMail-fallback-failed', { error: msg });
  }

  if (canFallbackGraphToSmtp()) {
    try {
      mailTransportLog('thread-reply-smtp-fallback-start', { mailbox });
      await sendGraphThreadReplyViaSmtpFallback(options, mailbox, messageId);
      mailTransportLog('thread-reply-success', { method: 'smtp-fallback', mailbox });
      return;
    } catch (error) {
      const msg = summarizeSmtpAuthError(error);
      failureChain.push(msg);
      mailTransportLog('thread-reply-smtp-fallback-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    failureChain.push(
      'SMTP fallback skipped (MAIL_GRAPH_FALLBACK_SMTP is not true — avoids masking Graph errors with SMTP 535)',
    );
  }

  throw new Error(formatThreadReplyFailureChain(failureChain));
}

async function sendGraphMailMultiRecipient(input: {
  mailbox: string;
  subject: string;
  html: string;
  toRecipients: EmailRecipient[];
  ccRecipients?: EmailRecipient[];
  bccRecipients?: EmailRecipient[];
  attachments?: MailAttachment[];
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  submissionSender?: import('./submissionSender').SubmissionSenderIdentity;
}): Promise<void> {
  const token = await getGraphAccessToken();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.mailbox)}/sendMail`;

  let cc = toGraphRecipients(input.ccRecipients);
  if (input.submissionSender) {
    const merged = mergeRecruiterIntoCcRecipients(input.ccRecipients, input.submissionSender, input.mailbox);
    cc = toGraphRecipients(merged);
  }

  const message: Record<string, unknown> = {
    subject: input.subject,
    body: {
      contentType: 'HTML',
      content: input.html,
    },
    toRecipients: toGraphRecipients(input.toRecipients),
  };
  const bcc = toGraphRecipients(input.bccRecipients);
  if (cc.length) message.ccRecipients = cc;
  if (bcc.length) message.bccRecipients = bcc;
  if (input.internetMessageHeaders?.length) {
    message.internetMessageHeaders = input.internetMessageHeaders;
  }
  if (input.submissionSender) {
    message.from = graphSubmissionFromRecipient(input.mailbox, input.submissionSender);
    message.replyTo = graphSubmissionReplyToRecipients(input.submissionSender);
    mailTransportLog('submission-sender', {
      displayName: input.submissionSender.displayName,
      replyTo: input.submissionSender.replyToEmail,
      path: 'sendMail-multi',
    });
  }

  if (input.attachments?.length) {
    message.attachments = input.attachments.map((att) => attachmentToGraphFileAttachment(att));
  }

  const payload = {
    message,
    saveToSentItems: true,
  };

  mailTransportLog('graph-sendMail-multi', {
    mailbox: input.mailbox,
    subject: input.subject,
    toCount: input.toRecipients.length,
    ccCount: cc.length,
    bccCount: bcc.length,
    hasThreadHeaders: !!input.internetMessageHeaders?.length,
  });

  const res = await graphHttp(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    const parsed = parseGraphErrorBody(res.status, text);
    mailTransportLog('graph-sendMail-multi-failed', {
      httpStatus: res.status,
      code: parsed.code,
      message: parsed.message,
    });
    throw new Error(formatGraphErrorLabel(parsed, 'Graph sendMail (thread fallback) failed'));
  }
}

async function sendGraphThreadReplyViaSendMail(
  options: GraphReplyAllOptions,
  mailbox: string,
  messageId: string,
): Promise<void> {
  const token = await getGraphAccessToken();
  const metaUrl =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}` +
    `?$select=subject,internetMessageId`;

  let baseSubject = options.replySubject?.trim() || '';
  let internetMessageId = '';
  try {
    const metaRes = await graphRequest(token, metaUrl, { method: 'GET' }, 'Graph get message for thread fallback');
    const meta = (await metaRes.json()) as { subject?: string; internetMessageId?: string };
    baseSubject = baseSubject || String(meta.subject ?? '').trim();
    internetMessageId = String(meta.internetMessageId ?? '').trim();
  } catch (error) {
    mailTransportLog('thread-fallback-subject-fetch-skipped', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const replySubject =
    formatGraphReplySubject(options.replySubject) ||
    (baseSubject
      ? baseSubject.toLowerCase().startsWith('re:')
        ? baseSubject
        : `Re: ${baseSubject}`
      : 'Re: Candidate submission');

  const toRecipients = (options.toRecipients ?? []).filter((r) => r.address?.trim());
  const ccRecipients = (options.ccRecipients ?? []).filter((r) => r.address?.trim());
  const bccRecipients = (options.bccRecipients ?? []).filter((r) => r.address?.trim());

  const internetMessageHeaders: Array<{ name: string; value: string }> = [];
  if (internetMessageId) {
    internetMessageHeaders.push(
      { name: 'In-Reply-To', value: internetMessageId },
      { name: 'References', value: internetMessageId },
    );
  }

  const primaryTo = toRecipients.length ? toRecipients : ccRecipients.slice(0, 1);
  const remainderCc = toRecipients.length ? ccRecipients : ccRecipients.slice(1);
  if (!primaryTo.length && !remainderCc.length) {
    throw new Error('No thread recipients available for Graph sendMail fallback');
  }

  await sendGraphMailMultiRecipient({
    mailbox,
    subject: replySubject,
    html: options.html,
    toRecipients: primaryTo,
    ccRecipients: remainderCc,
    bccRecipients,
    attachments: options.attachments,
    internetMessageHeaders: internetMessageHeaders.length ? internetMessageHeaders : undefined,
    submissionSender: options.submissionSender,
  });

  if (options.mailLog) {
    const toList = toRecipients.map((r) => r.address);
    const ccList = ccRecipients.map((r) => r.address);
    const bccList = bccRecipients.map((r) => r.address);
    await recordOutboundCommunication({
      ...options.mailLog,
      recipient: [...toList, ...ccList.map((e) => `cc:${e}`), ...bccList.map((e) => `bcc:${e}`)].join(', '),
      status: 'SENT',
      bodySnippet: options.html?.slice(0, 8000),
    });
  }
}

async function sendGraphThreadReplyViaSmtpFallback(
  options: GraphReplyAllOptions,
  mailbox: string,
  messageId: string,
): Promise<void> {
  const token = await getGraphAccessToken();
  const metaUrl =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}` +
    `?$select=subject`;
  let baseSubject = options.replySubject?.trim() || '';
  try {
    const metaRes = await graphRequest(token, metaUrl, { method: 'GET' }, 'Graph get message subject for SMTP fallback');
    const meta = (await metaRes.json()) as { subject?: string };
    baseSubject = baseSubject || String(meta.subject ?? '').trim();
  } catch {
    // Use replySubject only.
  }
  const replySubject =
    baseSubject && !baseSubject.toLowerCase().startsWith('re:') ? `Re: ${baseSubject}` : baseSubject || 'Re: Candidate submission';

  const recipients = [
    ...(options.toRecipients ?? []).map((r) => r.address),
    ...(options.ccRecipients ?? []).map((r) => r.address),
  ].filter(Boolean);
  const unique = [...new Set(recipients.map((e) => e.toLowerCase()))].map(
    (key) => recipients.find((e) => e.toLowerCase() === key)!,
  );

  mailTransportLog('smtp-fallback-send', { recipientCount: unique.length, subject: replySubject });

  for (const to of unique) {
    try {
      await sendMailViaSmtp({
        to,
        subject: replySubject,
        html: options.html,
        attachments: options.attachments,
      });
    } catch (error) {
      throw new Error(summarizeSmtpAuthError(error));
    }
  }

  if (options.mailLog) {
    await recordOutboundCommunication({
      ...options.mailLog,
      recipient: unique.join(', '),
      status: 'SENT',
      bodySnippet: options.html?.slice(0, 8000),
    });
  }
}

async function sendGraphReplyAllCore(
  options: GraphReplyAllOptions,
  mailbox: string,
  messageId: string,
): Promise<void> {
  mailTransportLog('createReplyAll-start', { mailbox, messageIdPrefix: messageId.slice(0, 24) });
  const token = await getGraphAccessToken();
  const baseMessageUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}`;

  const draftRes = await graphRequest(
    token,
    `${baseMessageUrl}/createReplyAll`,
    { method: 'POST', body: JSON.stringify({}) },
    'Graph createReplyAll',
  );
  const draft = (await draftRes.json()) as { id?: string };
  const draftId = draft.id?.trim();
  if (!draftId) {
    throw new Error('Graph createReplyAll did not return a draft message id');
  }

  const draftUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(draftId)}`;

  const patchBody: Record<string, unknown> = {
    body: {
      contentType: 'HTML',
      content: options.html,
    },
  };
  const replySubject = formatGraphReplySubject(options.replySubject);
  if (replySubject) {
    patchBody.subject = replySubject;
  }

  let ccList = options.ccRecipients ?? [];
  if (options.submissionSender) {
    patchBody.from = graphSubmissionFromRecipient(mailbox, options.submissionSender);
    patchBody.replyTo = graphSubmissionReplyToRecipients(options.submissionSender);
    ccList = mergeRecruiterIntoCcRecipients(ccList, options.submissionSender, mailbox);
    mailTransportLog('submission-sender', {
      displayName: options.submissionSender.displayName,
      replyTo: options.submissionSender.replyToEmail,
      path: 'createReplyAll',
    });
  }

  const toRecipients = toGraphRecipients(options.toRecipients);
  const ccRecipients = toGraphRecipients(ccList);
  const bccRecipients = toGraphRecipients(options.bccRecipients);
  if (toRecipients.length) patchBody.toRecipients = toRecipients;
  if (ccRecipients.length) patchBody.ccRecipients = ccRecipients;
  if (bccRecipients.length) patchBody.bccRecipients = bccRecipients;

  await graphRequest(
    token,
    draftUrl,
    {
      method: 'PATCH',
      body: JSON.stringify(patchBody),
    },
    'Graph update reply draft',
  );

  for (const attachment of options.attachments || []) {
    await graphRequest(
      token,
      `${draftUrl}/attachments`,
      {
        method: 'POST',
        body: JSON.stringify(attachmentToGraphFileAttachment(attachment)),
      },
      `Graph add attachment ${attachment.filename}`,
    );
  }

  await graphRequest(
    token,
    `${draftUrl}/send`,
    { method: 'POST', body: JSON.stringify({}) },
    'Graph send reply draft',
  );

  mailTransportLog('createReplyAll-complete', { mailbox, draftIdPrefix: draftId.slice(0, 24) });

  if (options.mailLog) {
    await recordOutboundCommunication({
      ...options.mailLog,
      recipient: options.mailLog.recipient || 'original requirement email thread',
      status: 'SENT',
      bodySnippet: options.html?.slice(0, 8000),
    });
  }
}

async function sendMailViaSmtp(options: MailSendOptions): Promise<void> {
  assertSmtpCredentials();
  const cfg = getMailConfig();
  const mailbox = cfg.user || cfg.from;
  const fromHeader = options.submissionSender
    ? formatSmtpSubmissionFrom(mailbox, options.submissionSender)
    : options.from ?? formatFromHeader(cfg);

  const mail: nodemailer.SendMailOptions = {
    to: options.to,
    subject: options.subject,
    html: options.html,
    from: fromHeader,
    ...(options.submissionSender
      ? { replyTo: options.submissionSender.replyToEmail }
      : options.replyTo
        ? { replyTo: options.replyTo }
        : {}),
    attachments:
      options.attachments?.map((a) => {
        if (a.content && a.content.length) {
          return {
            filename: a.filename,
            content: a.content,
            contentType:
              a.contentType ||
              mimeFromExt(path.extname(a.filename || '') || '.bin'),
            ...(a.cid ? { cid: a.cid } : {}),
          };
        }
        if (a.path) {
          return {
            filename: a.filename,
            path: a.path,
            ...(a.cid ? { cid: a.cid } : {}),
          };
        }
        throw new Error('MailAttachment requires path or content');
      }) ?? undefined,
  };

  await getTransporter().sendMail(mail);
}

export async function sendMailWithRetry(options: MailSendOptions): Promise<void> {
  const provider = getMailProvider();
  let useSmtp = provider === 'smtp';
  let graphAccessDeniedHandled = false;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      if (useSmtp) {
        await sendMailViaSmtp(options);
      } else {
        await sendMailViaGraph(options);
      }
      if (options.mailLog) {
        await recordOutboundCommunication({
          ...options.mailLog,
          subject: options.subject,
          recipient: options.to,
          status: 'SENT',
          bodySnippet: options.html?.slice(0, 8000),
        });
      }
      return;
    } catch (error) {
      lastError = error;

      // Graph token works but sendMail is forbidden without Application permission Mail.Send + admin consent.
      if (
        !useSmtp &&
        provider === 'graph' &&
        !graphAccessDeniedHandled &&
        isGraphAccessDeniedError(error)
      ) {
        if (canFallbackGraphToSmtp()) {
          graphAccessDeniedHandled = true;
          useSmtp = true;
          console.warn(
            '[mail] Graph sendMail returned Access Denied (403). Sending via SMTP fallback (MAIL_GRAPH_FALLBACK_SMTP=true). ' +
              'To use Graph: add Microsoft Graph Application permission Mail.Send + admin consent — see backend/OUTLOOK-SMTP-SETUP.md section 6.',
          );
          continue;
        }
        throw new Error(
          'Microsoft Graph sendMail denied (403 ErrorAccessDenied). Your app needs Application permission **Mail.Send** ' +
            'with admin consent. SMTP fallback is disabled unless MAIL_GRAPH_FALLBACK_SMTP=true. ' +
            'See backend/OUTLOOK-SMTP-SETUP.md section 6.',
        );
      }

      console.error(`[mail] send attempt ${attempt}/${MAX_RETRIES} failed`, error);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1] ?? 1000));
      }
    }
  }

  if (options.mailLog) {
    await recordOutboundCommunication({
      ...options.mailLog,
      subject: options.subject,
      recipient: options.to,
      status: 'FAILED',
      bodySnippet: options.html?.slice(0, 2000),
    });
  }

  throw new Error(
    `Failed to send email after ${MAX_RETRIES} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
