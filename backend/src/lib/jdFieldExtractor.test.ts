/// <reference types="jest" />

import { parseJdToFormFields } from './jdFieldExtractor';

describe('parseJdToFormFields', () => {
  it('extracts labeled fields from a typical staffing JD', () => {
    const jd = `
Job Title: Senior Java Developer
Client: KPMG
Location: Bangalore / Hybrid
Overall Experience: 6-8 years
Open Positions: 2
Employment Type: Contract
Work Mode: Hybrid
Notice Period: Immediate
Budget: 18 LPA
Priority: High
Mandatory Skills: Java, Spring Boot, Microservices, SQL
Required Skills: REST APIs, Git, Agile
Bill Rate: 18 LPA
    `.trim();

    const out = parseJdToFormFields(jd);
    expect(out.jobTitle).toMatch(/Senior Java Developer/i);
    expect(out.submittingTo).toBe('kpmg');
    expect(out.location).toMatch(/Bangalore/i);
    expect(out.experience).toMatch(/6-8/i);
    expect(out.positions).toBe(2);
    expect(out.employmentType).toBe('Contract');
    expect(out.workMode).toBe('Hybrid');
    expect(out.noticePeriod).toMatch(/immediate/i);
    expect(out.budgetAmountInr).toBe(1800000);
    expect(out.priority).toBe('High');
    expect(out.skills?.length).toBeGreaterThan(0);
    expect(out.skills).toEqual(expect.arrayContaining(['Java']));
  });

  it('infers technologies from body when skills section is absent', () => {
    const jd = `
We need a React developer with TypeScript, Node.js, and PostgreSQL experience.
Location: Hyderabad
Experience: 4+ years
    `.trim();

    const out = parseJdToFormFields(jd);
    expect(out.location).toMatch(/Hyderabad/i);
    expect(out.skills?.some((s) => /react/i.test(s))).toBe(true);
  });
});
