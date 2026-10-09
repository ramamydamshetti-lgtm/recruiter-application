import type { ParsedResumeCoreFields } from '@/lib/api/candidates';

export const EMPTY_PARSED_RESUME: ParsedResumeCoreFields = {
  candidateName: null,
  email: null,
  contactNumber: null,
  linkedinUrl: null,
  highestQualification: null,
  skillsRaw: null,
  technologiesRaw: null,
  totalExperience: null,
  relevantExperience: null,
  currentEmployer: null,
};

export type BulkReviewStatus = 'pending' | 'reviewing' | 'submitted' | 'error';

export type BulkReviewQueueItem = {
  id: string;
  sourceFile: string;
  file: File;
  parsed: ParsedResumeCoreFields;
  reviewStatus: BulkReviewStatus;
  parseError?: string;
  submittedAt?: string;
};

export function bulkQueueItemId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function bulkQueueCounts(items: BulkReviewQueueItem[]) {
  const submitted = items.filter((i) => i.reviewStatus === 'submitted').length;
  const pending = items.filter((i) => i.reviewStatus === 'pending').length;
  const reviewing = items.filter((i) => i.reviewStatus === 'reviewing').length;
  const failed = items.filter((i) => i.reviewStatus === 'error').length;
  const parsed = items.filter((i) => i.reviewStatus !== 'error').length;
  return { submitted, pending, reviewing, failed, parsed, total: items.length };
}

export function nextPendingQueueItem(items: BulkReviewQueueItem[]): BulkReviewQueueItem | null {
  return items.find((i) => i.reviewStatus === 'pending') ?? null;
}

export function setQueueItemStatus(
  items: BulkReviewQueueItem[],
  id: string,
  reviewStatus: BulkReviewStatus,
  extra?: Partial<Pick<BulkReviewQueueItem, 'submittedAt' | 'parseError'>>,
): BulkReviewQueueItem[] {
  return items.map((item) => {
    if (item.id === id) {
      return { ...item, ...extra, reviewStatus };
    }
    if (reviewStatus === 'reviewing' && item.reviewStatus === 'reviewing') {
      return { ...item, reviewStatus: 'pending' };
    }
    return item;
  });
}
