/**
 * Structured logging for Graph / SMTP mail transport (no secrets).
 */

const PREFIX = '[mail-transport]';

function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (/secret|password|pass|token|bearer/i.test(value) && value.length > 12) {
      return `${value.slice(0, 6)}…(${value.length} chars)`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|password|pass|token|authorization/i.test(k)) {
        out[k] = v ? '***' : v;
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export function mailTransportLog(stage: string, detail: Record<string, unknown> = {}): void {
  console.log(PREFIX, stage, JSON.stringify(redact(detail)));
}

export type ParsedGraphError = {
  httpStatus?: number;
  code?: string;
  message?: string;
  raw?: string;
};

/** Parse Microsoft Graph JSON error bodies for clearer logs and API responses. */
export function parseGraphErrorBody(httpStatus: number, text: string): ParsedGraphError {
  const base: ParsedGraphError = { httpStatus, raw: text.slice(0, 800) };
  try {
    const json = JSON.parse(text) as {
      error?: { code?: string; message?: string };
    };
    return {
      ...base,
      code: json.error?.code,
      message: json.error?.message,
    };
  } catch {
    return base;
  }
}

export function formatGraphErrorLabel(parsed: ParsedGraphError, label: string): string {
  const parts = [label];
  if (parsed.httpStatus) parts.push(`HTTP ${parsed.httpStatus}`);
  if (parsed.code) parts.push(parsed.code);
  if (parsed.message) parts.push(parsed.message);
  return parts.join(' — ');
}

export function summarizeSmtpAuthError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/535|authentication unsuccessful|invalid login/i.test(msg)) {
    return (
      'SMTP authentication failed (535). The app fell back to SMTP after Graph thread reply failed. ' +
      'Fix SMTP_USER/SMTP_PASS and enable Authenticated SMTP on the mailbox, or disable SMTP fallback ' +
      '(MAIL_GRAPH_FALLBACK_SMTP=false) and grant Graph Mail.ReadWrite for createReplyAll.'
    );
  }
  return `SMTP error: ${msg}`;
}
