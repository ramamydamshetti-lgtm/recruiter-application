import type { SemanticStatus } from '@/components/requirements/StatusBadge';

export type SubmissionStatus = Extract<
  SemanticStatus,
  'Submitted' | 'Submitted to Lead' | 'Submitted to Client' | 'Interview' | 'Selected' | 'Rejected'
>;

export type Submission = {
  id: string;
  /** Human-readable id for exports (e.g. SUB-2026-04-01-042). */
  submissionRef?: string | null;
  soNumber?: string | null;
  reasonForJobChange?: string | null;
  offerInHand?: string | null;
  relevantExperience?: string | null;
  selectedDate?: string | null;
  interviewDate?: string | null;
  interviewLocation?: string | null;
  interviewType?: 'PHONE' | 'VIDEO' | 'ONSITE' | null;
  rejectionReason?: string | null;
  candidate: {
    id: string;
    candidateRef?: string | null;
    name: string;
    email: string;
    phone?: string;
    currentCompany: string;
    experienceLabel: string;
    totalExperience?: number | null;
    skills?: string[];
    technologies?: string[];
    currentLocation?: string | null;
    preferredLocation?: string | null;
    noticePeriod?: string | null;
    currentSalary?: string | null;
    expectedSalary?: string | null;
    education?: string[];
    resumeUrl?: string | null;
    sourcePlatform?: string | null;
    sourcePlatformId?: string | null;
  };
  requirement: {
    id: string;
    requirementId?: string;
    roleTitle: string;
    clientName: string;
    skills?: string[];
    technologies?: string[];
    workMode?: string | null;
    employmentType?: string | null;
  };
  submittedBy: {
    id: string;
    name: string;
    email: string;
  };
  assignedLead?: { id: string; name: string; email: string } | null;
  assignedLeadName?: string | null;
  forwardedBy?: { id: string; name: string; email: string } | null;
  forwardedOn?: string | null;
  submittedOn: string;
  status: SubmissionStatus;
  /** Present when API returns email_sent flags (submit-to-client workflow). */
  emailSent?: boolean;
  emailSentDate?: string | null;
};
