/**
 * Email validation utilities. Optional domain allowlist via env.
 * Unset, empty, or * = any valid email (open registration).
 * Set ALLOWED_EMAIL_DOMAINS=metaforgeit.com,example.com to restrict.
 */

/**
 * Allowed domains from ALLOWED_EMAIL_DOMAINS (comma-separated, lowercase).
 * Returns empty array when restriction is disabled (allow any domain).
 */
export function getAllowedDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS;
  if (!raw || !raw.trim() || raw.trim() === '*') {
    return [];
  }
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Validates if email belongs to allowed domains
 * @param email - Email address to validate
 * @returns boolean - True if email domain is allowed
 */
export function isValidDomain(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Extract domain from email
  const domain = email.split('@').pop()?.toLowerCase();
  
  if (!domain) {
    return false;
  }

  const allowed = getAllowedDomains();
  if (allowed.length === 0) {
    return true;
  }

  return allowed.includes(domain);
}

/**
 * Validates email format and domain
 * @param email - Email address to validate
 * @returns object - Validation result with error message
 */
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email is required' };
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }

  // Check domain restriction (skipped when allowlist is empty)
  if (!isValidDomain(email)) {
    const allowed = getAllowedDomains();
    return { 
      isValid: false, 
      error: `Only ${allowed.join(', ')} email addresses are allowed` 
    };
  }

  return { isValid: true };
}

/**
 * Extracts username from email (everything before @)
 * @param email - Email address
 * @returns string - Username part of email
 */
export function extractUsername(email: string): string {
  return email.split('@')[0] || '';
}

/**
 * Normalizes email address (lowercase)
 * @param email - Email address to normalize
 * @returns string - Normalized email
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}
