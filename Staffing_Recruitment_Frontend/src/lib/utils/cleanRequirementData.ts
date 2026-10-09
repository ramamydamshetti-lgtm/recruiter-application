/**
 * Data cleaning utilities for Requirement records.
 * Normalizes strings, arrays, and null handling.
 */

function trimString(value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  return s === '' ? '' : s;
}

function cleanStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function cleanStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item) => trimString(item))
    .filter((s) => s.length > 0)
    .filter((s, i, a) => a.indexOf(s) === i); // dedupe
}

export type RequirementInput = Record<string, unknown>;

export function cleanRequirementInput(data: RequirementInput): RequirementInput {
  return {
    ...data,
    clientName: trimString(data.clientName),
    clientPoc: trimString(data.clientPoc),
    roleTitle: trimString(data.roleTitle),
    location: trimString(data.location),
    experience: trimString(data.experience),
    noticePeriod: cleanStringOrNull(data.noticePeriod),
    submittingTo: cleanStringOrNull(data.submittingTo),
    skills: cleanStringArray(data.skills),
    technologies: cleanStringArray(data.technologies),
    priority: trimString(data.priority) || 'Medium',
    status: trimString(data.status) || 'Open',
    assignment: trimString(data.assignment) || 'Unassigned',
  };
}
