/**
 * Job title to skills & technologies suggestions.
 * Used to auto-suggest fields when creating a new job demand.
 */

export type JobTitleSuggestion = {
  technologies: string[];
  skills: string[];
};

/** Keywords (lowercase) that trigger suggestions. First match wins. */
const JOB_TITLE_MAPPINGS: { keywords: string[]; technologies: string[]; skills: string[] }[] = [
  {
    keywords: ['full stack', 'fullstack', 'full-stack'],
    technologies: ['React', 'Node.js', 'TypeScript', 'JavaScript', 'REST APIs', 'SQL', 'Git'],
    skills: ['System Design', 'Problem Solving', 'Code Review', 'Agile', 'API Development'],
  },
  {
    keywords: ['frontend', 'front-end', 'front end', 'ui developer', 'web developer'],
    technologies: ['React', 'HTML', 'CSS', 'JavaScript', 'TypeScript', 'Responsive Design'],
    skills: ['UI/UX', 'Cross-browser Compatibility', 'Performance Optimization', 'Accessibility'],
  },
  {
    keywords: ['backend', 'back-end', 'back end', 'server'],
    technologies: ['Node.js', 'Python', 'Java', 'SQL', 'REST APIs', 'Microservices'],
    skills: ['Database Design', 'API Design', 'Security', 'Scalability'],
  },
  {
    keywords: ['data engineer', 'data engineering'],
    technologies: ['Python', 'SQL', 'Spark', 'AWS', 'ETL', 'Airflow'],
    skills: ['Data Pipelines', 'Data Modeling', 'Data Quality', 'ETL Design'],
  },
  {
    keywords: ['data scientist', 'data science', 'ml engineer', 'machine learning'],
    technologies: ['Python', 'TensorFlow', 'PyTorch', 'SQL', 'Pandas', 'Jupyter'],
    skills: ['Statistical Analysis', 'Machine Learning', 'Data Visualization', 'Model Development'],
  },
  {
    keywords: ['devops', 'dev ops', 'sre', 'site reliability'],
    technologies: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Terraform', 'Linux'],
    skills: ['Infrastructure as Code', 'Monitoring', 'Automation', 'Troubleshooting'],
  },
  {
    keywords: ['mobile', 'android', 'ios', 'react native', 'flutter'],
    technologies: ['React Native', 'Flutter', 'Swift', 'Kotlin', 'REST APIs'],
    skills: ['Mobile UI/UX', 'Performance', 'Cross-platform Development'],
  },
  {
    keywords: ['cloud', 'cloud architect', 'cloud engineer'],
    technologies: ['AWS', 'Azure', 'GCP', 'Terraform', 'Kubernetes', 'Docker'],
    skills: ['Cloud Architecture', 'Security', 'Cost Optimization', 'Migration'],
  },
  {
    keywords: ['qa', 'quality assurance', 'test engineer', 'sdet', 'automation'],
    technologies: ['Selenium', 'Cypress', 'Jest', 'Postman', 'JIRA'],
    skills: ['Test Automation', 'Manual Testing', 'API Testing', 'Bug Tracking'],
  },
  {
    keywords: ['product manager', 'product owner', 'pm '],
    technologies: ['JIRA', 'Confluence', 'Figma', 'Analytics'],
    skills: ['Product Strategy', 'Stakeholder Management', 'Roadmap Planning', 'User Research'],
  },
  {
    keywords: ['project manager', 'delivery manager'],
    technologies: ['JIRA', 'MS Project', 'Confluence'],
    skills: ['Agile', 'Scrum', 'Risk Management', 'Resource Planning'],
  },
  {
    keywords: ['business analyst', 'ba ', 'analyst'],
    technologies: ['SQL', 'Excel', 'JIRA', 'Power BI'],
    skills: ['Requirements Gathering', 'Data Analysis', 'Documentation', 'Process Modeling'],
  },
  {
    keywords: ['java', 'java developer'],
    technologies: ['Java', 'Spring Boot', 'SQL', 'REST APIs', 'Maven', 'Git'],
    skills: ['OOP', 'Design Patterns', 'Microservices', 'Unit Testing'],
  },
  {
    keywords: ['.net', 'dotnet', 'c#', 'csharp'],
    technologies: ['C#', '.NET', 'SQL Server', 'Azure', 'REST APIs'],
    skills: ['OOP', 'Design Patterns', 'ASP.NET', 'Entity Framework'],
  },
  {
    keywords: ['python', 'python developer'],
    technologies: ['Python', 'Django', 'Flask', 'SQL', 'REST APIs'],
    skills: ['OOP', 'API Development', 'Database Design', 'Testing'],
  },
  {
    keywords: ['salesforce', 'sfdc', 'crm'],
    technologies: ['Salesforce', 'Apex', 'Lightning', 'SOQL'],
    skills: ['CRM Configuration', 'Salesforce Admin', 'Integration', 'Custom Development'],
  },
  {
    keywords: ['sap', 'erp'],
    technologies: ['SAP', 'ABAP', 'SAP FICO', 'SAP MM'],
    skills: ['ERP Implementation', 'Business Process', 'Integration', 'Configuration'],
  },
];

/**
 * Get suggested technologies and skills for a job title.
 * Returns null if no match found.
 */
export function getSuggestionsForJobTitle(jobTitle: string): JobTitleSuggestion | null {
  const normalized = jobTitle.trim().toLowerCase();
  if (!normalized) return null;

  for (const mapping of JOB_TITLE_MAPPINGS) {
    const hasMatch = mapping.keywords.some((kw) => normalized.includes(kw));
    if (hasMatch) {
      return {
        technologies: [...mapping.technologies],
        skills: [...mapping.skills],
      };
    }
  }
  return null;
}
