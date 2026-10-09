import type { SemanticStatus } from '@/components/requirements/StatusBadge';

export type CandidateStatus = Extract<
  SemanticStatus,
  'Submitted' | 'Submitted to Lead' | 'Submitted to Client' | 'Interview' | 'Selected' | 'Rejected' | 'Assigned' | 'Closed'
>;

export type JobDemand = {
  id: string; // internal requirement primary key (cuid) used for submission + routing
  jdCode?: string; // visible Requirement ID code (REQ-YYYY-MM-DD-XXX)
  jobTitle: string;
  clientLeadPoc: string;
  assignedRecruiters: { id: string; name: string; email: string }[];
};

export type Candidate = {
  id: string;
  /** Human-readable id from API (e.g. CAND-2026-06-05-001). Prefer over internal id in tables. */
  candidateRef?: string | null;
  name: string;
  email: string;
  phone: string;
  candidateCode?: string; // optional entry-page label; backend ref is candidateRef (CAND-YYYY-MM-DD-XXX)
  currentEmployer?: string;
  /** Same as DB `current_location`; required for client submission email. */
  currentLocation?: string | null;
  location?: string;
  /** DB `current_salary` — Current CTC text; required for client submission email. */
  currentSalary?: string | null;
  /** DB `available_for_interview`; required for client submission email. */
  availableForInterview?: string | null;
  skills?: string[];
  education?: string[];
  highestQualification?: string | null;
  preferredLocation?: string | null;
  /** DB `expected_salary` — Expected CTC; required for client submission email. */
  expectedSalary?: string | null;
  noticePeriod?: string | null;
  relevantExperience?: string | null;
  reasonForJobChange?: string | null;
  offerInHand?: string | null;
  /** When offer in hand is yes: optional CTC / amount text. */
  offerInHandAmount?: string | null;
  /** When offer in hand is yes: optional company that extended the offer. */
  offerInHandCompany?: string | null;
  /** Multiple offers: `{ offers: [{ company?, ctc? }] }` (JSON from API). */
  offerInHandDetails?: { offers: Array<{ company?: string; ctc?: string }> } | null;
  /** Recruiter notes (Candidate Search & Entry). */
  notes?: string | null;
  linkedinUrl?: string | null;
  /** Parsed total years (career). Prefer for display over experienceLabel. */
  totalExperience?: number | null;
  experienceLabel?: string; // legacy / free-text; may duplicate total years
  technologies: string[]; // normalized lower-case tokens
  resumeRef?: string; // placeholder only

  createdAt: string; // ISO
  /** DB `updated_at` — use for “most recently changed / imported” ordering. */
  updatedAt?: string; // ISO
  createdBy?: { id: string; name: string; email: string } | null;
};

export type CandidateSubmission = {
  id: string;
  candidateId: string;
  jdId: string;
  submittedBy: { id: string; name: string; email: string };
  submittedOn: string; // ISO
  status: CandidateStatus;

  // Submission-specific details captured during entry (optional)
  soNumber?: string;
  totalExperience?: string;
  relevantExperience?: string;
  currentCtc?: string;
  expectedCtc?: string;
  noticePeriod?: string;
  currentLocation?: string;
  preferredLocation?: string;
  availableForInterview?: boolean;
  reasonForJobChange?: string;
  offerInHand?: boolean;
  offerInHandAmount?: string | null;
  offerInHandCompany?: string | null;
  offerInHandDetails?: { offers: Array<{ company?: string; ctc?: string }> } | null;
  linkedinUrl?: string;
  highestQualification?: string;
};
