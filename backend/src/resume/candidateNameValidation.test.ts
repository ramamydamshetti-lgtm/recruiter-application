/// <reference types="jest" />

import {
  isBadCandidateDisplayName,
  trimJobTitleSuffixFromDisplayName,
} from './candidateNameValidation';

describe('candidateNameValidation', () => {
  it('rejects section titles mistaken for names', () => {
    expect(isBadCandidateDisplayName('Curriculum Vitae')).toBe(true);
    expect(isBadCandidateDisplayName('Experience Summary')).toBe(true);
    expect(isBadCandidateDisplayName('CURRICULUM VITAE')).toBe(true);
  });

  it('rejects role-heavy parsed lines', () => {
    expect(isBadCandidateDisplayName('Y. Nagalakshmi Assistant Manager')).toBe(true);
    expect(isBadCandidateDisplayName('Mohammed Junaid Employee Central Time')).toBe(true);
  });

  it('accepts plausible person names', () => {
    expect(isBadCandidateDisplayName('Mrutyunjaya Mahapatra')).toBe(false);
    expect(isBadCandidateDisplayName('Abdul Azizkhan')).toBe(false);
    expect(isBadCandidateDisplayName('Monisha Mohanan')).toBe(false);
  });

  it('trims trailing job title tokens', () => {
    expect(trimJobTitleSuffixFromDisplayName('Nagalakshmi Assistant Manager')).toBe('Nagalakshmi');
  });
});
