export type CurrentUserRole = 'Recruiter' | 'Lead';

/** Who should act on this demand: Lead (assign) or Recruiter (self-assign). */
export type ActionNeeded = 'Lead' | 'Recruiter';

/** Lead assignment flow: auto or manual recruiter selection. */
export type AssignmentMode = 'auto_assign' | 'assign_to_recruiters';

export type RequirementPriority = 'High' | 'Medium' | 'Low';

export type RequirementStatus =
  | 'Open'
  | 'Assigned'
  | 'Submitted'
  | 'Interview'
  | 'Selected'
  | 'Rejected'
  | 'Closed';

export type RequirementAssignment = 'Unassigned' | 'Assigned';

export type Recruiter = {
  [x: string]: any;
  id: string;
  name: string;
  email: string;
  title: string;
};

export type Requirement = {
  id: string; // internal cuid from API
  requirementId?: string; // REQ-YYYY-MM-DD-XXX (stored in requirement_id)
  /** FK to clients table when API returns it (create/edit flows). */
  clientId?: string;
  clientLeadPoc: string;
  clientPoc: string;
  roleTitle: string;
  location: string;
  experience: string;
  experienceLevel?: string;
  employmentType?: string;
  workMode?: string;
  /** Legacy mirror: same units as yearly/monthly for the active employment type. */
  overallBudget?: number;
  budgetCurrency?: 'INR' | 'USD' | 'EUR';
  /** Full-time: yearly amount in `budgetCurrency`. */
  yearlyBudget?: number | null;
  /** Contract: monthly amount in `budgetCurrency`. */
  monthlyBudget?: number | null;
  noticePeriod?: string; // e.g. "Immediate (0-15 days)", "30 days", "60 days"
  skills: string[];
  technologies?: string[];
  priority: RequirementPriority;
  openPositions?: number;
  slaDays?: number;
  submittingTo?: string;
  /** Internal / hiring POC (persisted on requirement). */
  internalPoc?: string;
  /** Single | Multiple | Bulk */
  demandType?: string;
  /** Original requirement email subject — used to link client thread replies for manual demands. */
  sourceEmailSubject?: string | null;
  /** ISO date when status is Closed */
  closedDate?: string | null;
  owner: {
    id: string;
    name: string;
    email: string;
    title: string;
  };
  /** Persisted: who created the demand (API may return as requirementCreatorName). */
  requirementCreatorName?: string | null;
  /** Persisted: recruiter assigned to the demand (API may return as assignedToRecruiterName). */
  assignedToRecruiterName?: string | null;
  /** Persisted: who performed the assignment (API may return as assignmentAssignerName). */
  assignmentAssignerName?: string | null;
  /** Who assigned this requirement (e.g. Lead name). Shown as "Assigned by X". */
  assignedBy?: string;
  /** Most recent active assignment timestamp (ISO). Used to sort Assigned dashboard rows. */
  assignedOn?: string | null;
  /** Optional: when multiple recruiters are assigned, list all. Falls back to owner when absent. */
  assignedRecruiters?: Array<{
    id: string;
    name: string;
    email: string;
    title: string;
  }>;
  status: RequirementStatus;
  assignment: RequirementAssignment;
  /** Active assignee user id from requirement_assignments (when API enriches). */
  activeAssigneeId?: string | null;
  /** All active assignee user ids (primary first). */
  activeAssigneeIds?: string[];
  /** First assigned recruiter — keeps owner control when others are added. */
  primaryOwnerId?: string | null;
  submissionsCount: number;

  // lifecycle + governance
  isDeleted: boolean;
  deletedAt: string | null; // ISO
  createdAt: string; // ISO
  updatedAt: string; // ISO
  updatedBy?: string;
};
