import { getPublicApiBase } from '@/lib/publicOrigin';

export type JdExtractFormFields = {
  jobTitle?: string;
  clientLeadPoc?: string;
  clientPoc?: string;
  location?: string;
  experience?: string;
  experienceLevel?: string;
  noticePeriod?: string;
  skills?: string[];
  technologies?: string[];
  positions?: number;
  employmentType?: 'Full-time' | 'Contract';
  workMode?: string;
  budgetAmountInr?: number;
  budgetCurrency?: string;
  priority?: 'High' | 'Medium' | 'Low';
  demandType?: 'Single' | 'Multiple' | 'Bulk';
  submittingTo?: string;
  jdDescription?: string;
  extractionSource?: string;
  totalRolesDetected?: number;
  roleTitle?: string;
  usedFallbackParser?: boolean;
};

function authHeaders(json = false): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function parseExtractResponse(response: Response): Promise<JdExtractFormFields> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (result as { message?: string; error?: string }).message ||
        (result as { error?: string }).error ||
        `JD extraction failed (${response.status})`,
    );
  }
  const data = (result as { data?: JdExtractFormFields }).data;
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid extraction response from server');
  }
  return data;
}

/** Extract form fields from pasted JD text. */
export async function extractJdFromText(text: string): Promise<JdExtractFormFields> {
  const response = await fetch(`${getPublicApiBase()}/api/ai/extract-jd`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ text: text.trim() }),
  });
  return parseExtractResponse(response);
}

/** Extract form fields from an uploaded JD document (PDF/DOCX). */
export async function extractJdFromFile(file: File): Promise<JdExtractFormFields> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${getPublicApiBase()}/api/ai/extract-jd`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  return parseExtractResponse(response);
}
