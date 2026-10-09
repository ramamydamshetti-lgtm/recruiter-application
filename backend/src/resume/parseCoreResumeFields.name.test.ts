/// <reference types="jest" />

import { parseCoreFieldsFromResumeText } from './parseCoreResumeFields';

describe('parseCoreFieldsFromResumeText — candidate name', () => {
  it('does not return Curriculum Vitae or Experience Summary as the name', () => {
    const cvOnly = parseCoreFieldsFromResumeText(
      ['Curriculum Vitae', '', 'Email: test@example.com', '9999999999'].join('\n'),
    );
    expect(cvOnly.candidateName).toBeNull();

    const expSummary = parseCoreFieldsFromResumeText(
      ['Experience Summary', '', 'Email: narendra@example.com', '8888888888'].join('\n'),
    );
    expect(expSummary.candidateName).toBeNull();
  });

  it('prefers labeled name over section headings', () => {
    const parsed = parseCoreFieldsFromResumeText(
      [
        'Curriculum Vitae',
        'Name: Mrutyunjaya Mahapatra',
        'Email: mrutyu@example.com',
        '9876543210',
      ].join('\n'),
    );
    expect(parsed.candidateName).toBe('Mrutyunjaya Mahapatra');
  });
});
