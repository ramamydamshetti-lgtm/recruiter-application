/// <reference types="jest" />

import { shouldIngestRequirementEmail } from '@/routes/internalAutomation';

describe('shouldIngestRequirementEmail', () => {
  it('allows KPMG vendor RE: thread with "Please share suitable profiles"', () => {
    const subject =
      'RE: C2H |  backend, AI/ML/GenAI/AgenticAI ,full stack , QA, Product Owner, AI Architect';
    const bodyText = [
      'Dear Vendors,',
      '',
      'Please share suitable profiles for below mentioned skills on TOP PRIORITY. FOCUS on AI Architect profiles.',
      '',
      '2 backend',
      '2 full stack',
      '3 AI/ML/GenAI/AgenticAI',
      '1 QA',
      '1 Product Owner',
      '1 AI Architect',
      'HYD location - 4 Days a week at client location',
      '',
      'A.1 Backend Engineers',
      '• Minimum 4+ years of backend development experience',
      '• Strong proficiency in Python',
      '• 3–6 years of experience in full-stack or backend development',
    ].join('\n');

    const decision = shouldIngestRequirementEmail(
      {
        subject,
        bodyText,
        fromEmail: 'rparimi@kpmg.com',
      },
      {},
    );

    expect(decision.allow).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it('allows KPMG RE: with normal staffing wording (no vendor "please share" phrase)', () => {
    const decision = shouldIngestRequirementEmail(
      {
        subject: 'RE: Python backend — Hyderabad',
        bodyText: [
          'Hi team,',
          '',
          'We have 2 openings for backend engineers. Mandatory skills: Python, GCP, REST APIs.',
          'Location: Hyderabad. Share profiles by EOD Thursday.',
        ].join('\n'),
        fromEmail: 'someone@kpmg.com',
      },
      {},
    );

    expect(decision.allow).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it('allows KPMG WORKDAY FTE structured JD without share-profiles phrasing', () => {
    const bodyText = [
      'Hi Raghu,',
      '',
      'Need urgent and critical',
      '',
      'Yrs – 7-8+',
      'Budget – Will let u know',
      'Location – Remote',
      '',
      'Role title: Workday Integration SME',
      'Role purpose',
      'The Workday Integration SME will lead and support design, build, and testing.',
      'Key responsibilities',
      'Design, build, enhance, or repoint Workday integrations',
      'Skills and experience',
      'Must have',
      'Workday Studio (mandatory)',
      'Workday SOAP and REST APIs',
    ].join('\n');

    const decision = shouldIngestRequirementEmail(
      {
        subject: 'WORKDAY | FTE',
        bodyText,
        fromEmail: 'vinutaks@kpmg.com',
      },
      {},
    );

    expect(decision.allow).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it('still blocks plain RE: from verified client with no requirement cues', () => {
    const decision = shouldIngestRequirementEmail(
      {
        subject: 'RE: heads up on staffing call',
        bodyText: 'Looping you in on Thursday sync. No action needed.',
        fromEmail: 'rparimi@kpmg.com',
      },
      {},
    );

    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/reply thread|operational reply|latest message/i);
  });

  it('blocks RE: from non-verified sender without strong requirement context', () => {
    const decision = shouldIngestRequirementEmail(
      {
        subject: 'RE: random thread',
        bodyText: 'Just following up from the conference.',
        fromEmail: 'person@example.com',
      },
      {},
    );

    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/reply thread/i);
  });

  it('blocks LTTS interview availability coordination (would otherwise hit verified-client shortcut)', () => {
    const decision = shouldIngestRequirementEmail(
      {
        subject: 'RE: TPC - Scrum master.',
        bodyText: [
          'Hi Charlie,',
          '',
          'Please check the availability of the below any 3 candidates.',
          '',
          'MetaforgeIT',
          'Scrum master',
          'ANUSHA JALAGADUGU',
          '7569359245',
          'anushajalagadugu.sm111@gmail.com',
          'Interview to be scheduled',
          '5/18/2026',
          '3:00PM',
        ].join('\n'),
        fromEmail: 'Deepashree.Bc_ext@ltts.com',
      },
      {},
    );

    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/interview scheduling|availability coordination|interview-tracker/i);
    expect(decision.decisionTag).toBe('INTERVIEW_COORDINATION_OR_TRACKER');
  });

  it.each([
    'charlie@metaforgeit.com',
    'pavani@metaforgeit.com',
    'rahimoon@metaforgeit.com',
  ])('strictly blocks @metaforgeit.com recruiter (%s) regardless of body', (fromEmail) => {
    const decision = shouldIngestRequirementEmail(
      {
        subject: 'Fwd: SAP consultant — Hyderabad',
        bodyText: [
          'Mandatory skills: ABAP, OData',
          'Open positions: 2',
          'Overall exp: 5+ years',
          'Budget: 25 LPA',
          'Please share suitable profiles',
        ].join('\n'),
        fromEmail,
      },
      {},
    );

    expect(decision.allow).toBe(false);
    expect(decision.decisionTag).toBe('INTERNAL_RECRUITER_BLOCK');
    expect(decision.reason).toMatch(/strict block.*internal team\/recruiter/i);
  });

  it('blocks ITC RE: SO tagging coordination (Kindly tag the below SO)', () => {
    const decision = shouldIngestRequirementEmail(
      {
        subject: 'RE: Urgent and Critical hiring- ERP',
        bodyText: [
          'Dear Raji,',
          '',
          'Kindly tag the below SO',
          '',
          'PCIIL_0000252300_1',
          '',
          'Regards',
          'Shilpa',
          '',
          'From: Rahimoon Shaik <rahima.s@metaforgeit.com>',
          'Sent: 18 May 2026 14:18',
          'Subject: RE: Urgent and Critical hiring- ERP',
          '',
          'Mandatory skills: SAP, FICO',
          'Openings: 3',
          'Overall exp: 5+ years',
        ].join('\n'),
        fromEmail: 'Shilpa.Shreelaja@itcinfotech.com',
      },
      {},
    );

    expect(decision.allow).toBe(false);
    expect(decision.decisionTag).toBe('OPERATIONAL_REPLY_OR_COORDINATION');
    expect(decision.reason).toMatch(/operational reply|latest message/i);
  });

  it('blocks ITC RE: one-word Done acknowledgment', () => {
    const decision = shouldIngestRequirementEmail(
      {
        subject: 'RE: Urgent and Critical hiring- ERP',
        bodyText: [
          'Done',
          '',
          'From: Rahimoon Shaik <rahima.s@metaforgeit.com>',
          'Sent: 18 May 2026 14:18',
          'Subject: RE: Urgent and Critical hiring- ERP',
          '',
          'Please share suitable profiles for SAP consultants.',
          'Openings: 2',
        ].join('\n'),
        fromEmail: 'Rajeshwari.Negi@itcinfotech.com',
      },
      {},
    );

    expect(decision.allow).toBe(false);
    expect(decision.decisionTag).toBe('OPERATIONAL_REPLY_OR_COORDINATION');
    expect(decision.reason).toMatch(/acknowledgment|Done/i);
  });

  it('blocks short Invite sent acknowledgment on Re: TPC thread', () => {
    const decision = shouldIngestRequirementEmail(
      {
        subject: 'RE: TPC - Scrum master.',
        bodyText: ['Invite sent', '', 'Thanks and Regards', 'Deepashree'].join('\n'),
        fromEmail: 'Deepashree.Bc_ext@ltts.com',
      },
      {},
    );

    expect(decision.allow).toBe(false);
    expect(['INTERVIEW_COORDINATION_OR_TRACKER', 'OPERATIONAL_REPLY_OR_COORDINATION']).toContain(
      decision.decisionTag,
    );
  });
});
