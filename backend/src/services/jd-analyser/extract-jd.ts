import type { RequirementData } from "./types/requirement";
import { extractWithLlm, type ExtractOptions, type LlmProvider } from "./llm-extract";

export type ExtractionSource = LlmProvider;

export interface ExtractionResult {
  data: RequirementData;
  source: ExtractionSource;
}

export async function extractJobRequirement(
  rawJdText: string,
  options?: ExtractOptions
): Promise<ExtractionResult> {
  const { data, provider } = await extractWithLlm(rawJdText, options);
  return { data, source: provider };
}
