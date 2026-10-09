import { extractJobRequirement } from './extract-jd';
import {
  extractCommonMetadata,
  mergeInheritedFields,
  toRequirementData,
} from './jd-utils';
import { detectRequirementsWithLlm } from './multi-requirement-llm';
import type { RequirementData } from './types/requirement';
import { mapRequirementToFormFields } from './mapToFormFields';
import type { JdExtractFormFields } from '../../lib/jdFieldExtractor';

export type JdAnalyzeResult = {
  fields: JdExtractFormFields;
  source: string;
  totalRoles: number;
  roleIndex: number;
  roleTitle?: string;
};

/**
 * Analyze pasted or file-extracted JD text using the LLM JD Analyser.
 * For multi-role JDs, returns the first role (recruiter creates one demand at a time).
 */
export async function analyzeJdText(rawJdText: string): Promise<JdAnalyzeResult> {
  const text = rawJdText.trim();
  if (!text) {
    throw new Error('Job description text is required');
  }

  const chunks = await detectRequirementsWithLlm(text);
  const totalRoles = chunks.length;
  const chunk = chunks[0]!;
  const commonMetadata = toRequirementData(extractCommonMetadata(text));

  const { data, source } = await extractJobRequirement(chunk.content, {
    hintTitle: chunk.title,
    fullJdText: text,
  });

  let merged: RequirementData = mergeInheritedFields(data, commonMetadata);

  if (chunk.title && merged.jobTitle === 'Not specified') {
    merged = { ...merged, jobTitle: chunk.title };
  }

  if (
    merged.numberOfPositions === 'Not specified' &&
    chunk.numberOfPositions
  ) {
    merged = { ...merged, numberOfPositions: chunk.numberOfPositions };
  }

  const fields = mapRequirementToFormFields(merged, { jdText: text });

  return {
    fields,
    source,
    totalRoles,
    roleIndex: 1,
    roleTitle: chunk.title,
  };
}
