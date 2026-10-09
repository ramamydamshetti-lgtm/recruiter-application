export interface RequirementData {
  requirementId: string;
  jobTitle: string;
  /** True when jobTitle was inferred by AI (no explicit title in JD) */
  isInferredTitle?: boolean;
  clientLeadPocFrom: string;
  clientPocFromCc: string;
  internalPocTo: string;
  requirementFrom: string;
  demandReceivedDate: string;
  closedDate: string;
  openSince: string;
  typeOfDemand: string;
  jobStatus: string;
  priority: string;
  relevantExperience: string;
  overallExperience: string;
  qualificationCriteria: string;
  employmentType: string;
  workMode: string;
  workTimings: string;
  location: string;
  numberOfPositions: string;
  budgetCurrency: string;
  monthlyBudget: string;
  annualBudget: string;
  noticePeriod: string;
  sla: string;
  mandatorySkills: string[];
  skills: string[];
  jobDescription: string;
}

export const EMPTY_REQUIREMENT: RequirementData = {
  requirementId: "Not specified",
  jobTitle: "Not specified",
  clientLeadPocFrom: "Not specified",
  clientPocFromCc: "Not specified",
  internalPocTo: "Not specified",
  requirementFrom: "Not specified",
  demandReceivedDate: "Not specified",
  closedDate: "Not specified",
  openSince: "Not specified",
  typeOfDemand: "Not specified",
  jobStatus: "Unassigned",
  priority: "Not specified",
  relevantExperience: "Not specified",
  overallExperience: "Not specified",
  qualificationCriteria: "Not specified",
  employmentType: "Not specified",
  workMode: "Not specified",
  workTimings: "Not specified",
  location: "Not specified",
  numberOfPositions: "Not specified",
  budgetCurrency: "Not specified",
  monthlyBudget: "Not specified",
  annualBudget: "Not specified",
  noticePeriod: "Not specified",
  sla: "Not specified",
  mandatorySkills: [],
  skills: [],
  jobDescription: "",
};

/** Result returned from /api/analyze for each detected role */
export interface AnalyzedRequirement extends RequirementData {
  requirementTitle: string;
  roleIndex: number;
  totalRoles: number;
  extractionSource?: string;
  runId?: string;
  predictionId?: string;
  policyVersion?: string;
  lastRewardScore?: number;
  feedbackSaved?: boolean;
  /** True when a prior human correction was overlaid on the LLM output */
  correctionApplied?: boolean;
}
