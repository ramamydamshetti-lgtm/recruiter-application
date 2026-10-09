export function validateParsedResult(data) {
  const errors = [];

  if (typeof data !== "object" || data === null) {
    return { valid: false, errors: ["Response is not an object"] };
  }

  const stringFields = [
    "full_name",
    "contact",
    "email",
    "linkedin",
    "qualification",
    "total_experience",
    "relevant_experience",
  ];

  for (const field of stringFields) {
    if (data[field] !== null && data[field] !== undefined && typeof data[field] !== "string") {
      errors.push(`${field} must be a string or null`);
    }
  }

  for (const field of ["skills", "technology", "work_periods", "relevant_work_periods"]) {
    if (data[field] !== undefined && data[field] !== null && !Array.isArray(data[field])) {
      errors.push(`${field} must be an array`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function extractJsonFromText(raw) {
  if (!raw?.trim()) {
    throw new Error("No JSON in model response");
  }

  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) {
    throw new Error("No JSON in model response");
  }

  const slice = text.slice(start, end + 1);

  try {
    return JSON.parse(slice);
  } catch {
    const repaired = slice
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    try {
      return JSON.parse(repaired);
    } catch {
      throw new Error("No JSON in model response");
    }
  }
}
