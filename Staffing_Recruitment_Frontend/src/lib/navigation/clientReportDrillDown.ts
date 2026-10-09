export type ClientReportMetric = 'reqSent' | 'reqAssigned' | 'submissions' | 'open' | 'closed';

export function buildClientReportDrillDownHref(
  clientName: string,
  metric: ClientReportMetric,
): string {
  const client = encodeURIComponent(clientName.trim());
  switch (metric) {
    case 'reqSent':
      return `/requirements?client=${client}&status=All`;
    case 'reqAssigned':
      return `/requirements?client=${client}&status=Assigned`;
    case 'submissions':
      return `/submissions?client=${client}`;
    case 'open':
      return `/requirements?client=${client}&openOnly=1`;
    case 'closed':
      return `/requirements?client=${client}&status=Closed`;
  }
}

export function requirementMatchesClientQuery(
  r: {
    submittingTo?: string | null;
    clientLeadPoc?: string | null;
    clientPoc?: string | null;
    clientName?: string | null;
  },
  clientQuery: string,
): boolean {
  const needle = clientQuery.trim().toLowerCase();
  if (!needle) return true;
  const hay = [r.submittingTo, r.clientLeadPoc, r.clientPoc, r.clientName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

export function submissionMatchesClientQuery(
  sub: { requirement: { clientName?: string | null } },
  clientQuery: string,
): boolean {
  const needle = clientQuery.trim().toLowerCase();
  if (!needle) return true;
  const hay = (sub.requirement.clientName ?? '').toLowerCase();
  return hay.includes(needle);
}
