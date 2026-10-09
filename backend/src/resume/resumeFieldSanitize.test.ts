/// <reference types="jest" />

import { compactHighestQualification, looksLikeJobRolePhrase, sanitizeDisplayText } from './resumeFieldSanitize';
import { parseCoreFieldsFromResumeText } from './parseCoreResumeFields';

describe('resumeFieldSanitize', () => {
  it('compacts narrative education into degree · university · year', () => {
    const hq = compactHighestQualification(
      'Completed Degree in B COM (COMPUTERS) From Acharya Nagarjuna University in April 2021 in',
    );
    expect(hq).toMatch(/B\.?\s*COM/i);
    expect(hq).toMatch(/Acharya Nagarjuna University/i);
    expect(hq).toMatch(/2021/);
    expect(hq).not.toMatch(/\s+in\s*$/i);
  });

  it('strips trailing periods from display text', () => {
    expect(sanitizeDisplayText('Mohammed Junaid.')).toBe('Mohammed Junaid');
  });

  it('detects job-role phrases that belong in technology not skills', () => {
    expect(looksLikeJobRolePhrase('SAP SuccessFactors Consultant')).toBe(true);
    expect(looksLikeJobRolePhrase('SF EC')).toBe(false);
  });
});

describe('parseCoreFieldsFromResumeText — field formatting', () => {
  it('separates skills and technology for SAP profile', () => {
    const parsed = parseCoreFieldsFromResumeText(
      [
        'Mohammed Junaid',
        'mohammedjunaidsapsf@gmail.com',
        '+917013044354',
        '',
        'Professional Summary',
        'SAP SuccessFactors Consultant with 3 years experience',
        '',
        'Technical Skills',
        'SF EC, Time Off, Employee Central',
        '',
        'Education',
        'Completed Degree in B COM (COMPUTERS) From Acharya Nagarjuna University in April 2021',
      ].join('\n'),
    );

    expect(parsed.candidateName).toBe('Mohammed Junaid');
    expect(parsed.highestQualification).toMatch(/COM/i);
    expect(parsed.highestQualification).not.toMatch(/\s+in\s*$/i);
    expect(parsed.skillsRaw).toMatch(/SF EC/i);
    expect(parsed.skillsRaw).not.toMatch(/SuccessFactors Consultant/i);
    expect(parsed.technologiesRaw).toMatch(/SAP/i);
    expect(parsed.skillsRaw).not.toContain('.');
  });
});
