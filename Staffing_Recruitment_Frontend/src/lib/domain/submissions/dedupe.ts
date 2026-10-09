import type { Submission } from './types';
import type { CandidateSubmission } from '@/lib/domain/candidates/types';

function toMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function bySubmittedOnDesc<T extends { submittedOn: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => toMs(b.submittedOn) - toMs(a.submittedOn));
}

export function dedupeSubmissionsByCandidateRequirement(items: Submission[]): Submission[] {
  const latestByKey = new Map<string, Submission>();
  for (const item of items) {
    const candidateId = item.candidate?.id ?? '';
    const requirementId = item.requirement?.id ?? '';
    if (!candidateId || !requirementId) continue;
    const key = `${candidateId}::${requirementId}`;
    const prev = latestByKey.get(key);
    if (!prev || toMs(item.submittedOn) > toMs(prev.submittedOn)) {
      latestByKey.set(key, item);
    }
  }
  return bySubmittedOnDesc([...latestByKey.values()]);
}

export function dedupeCandidateSubmissionsByCandidateRequirement(
  items: CandidateSubmission[],
): CandidateSubmission[] {
  const latestByKey = new Map<string, CandidateSubmission>();
  for (const item of items) {
    const candidateId = item.candidateId ?? '';
    const jdId = item.jdId ?? '';
    if (!candidateId || !jdId) continue;
    const key = `${candidateId}::${jdId}`;
    const prev = latestByKey.get(key);
    if (!prev || toMs(item.submittedOn) > toMs(prev.submittedOn)) {
      latestByKey.set(key, item);
    }
  }
  return bySubmittedOnDesc([...latestByKey.values()]);
}
