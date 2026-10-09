/**
 * Quick test for JD Analyser integration (POST /api/ai/extract-jd).
 * Usage: node test-jd-extract.js
 */
const fetch = require('node-fetch').default || require('node-fetch');
require('dotenv').config();

const PORT = process.env.PORT || 8080;
const BASE = `http://localhost:${PORT}`;

const SAMPLE_JD = `Dear Partner,

Kindly share quality profiles with @Praveen Kumar S A & @Deepashree B C on priority.

Job Title: C# with Mobile Automation.

Overall exp – 4 - 8 Years
Open Positions - 4
Qualification Criteria- BE/BTECH
Mandatory Skills – API Automation, C#, Nunit, JSON, Selenium webdriver, Appium, iOS & Android Testing, GraphQL, Git, CI/CD, BrowserStack, ADB, POM Framework, Allure/Extent Reporting

ONLY IMMEDIATE JOINERS REQUIRED
TPC Rates – 140000
Work Location – Bangalore/Mysore.

Job Description:

Key Areas of Responsibility

Hands on experience in API automation using RestSharp or HttpClient.
Good understanding of JSON parsing, response validation.
UI test automation using Selenium webdriver
Strong programming skill in C# with good understanding of OOPS concepts
Familiarity with test frameworks NUnit etc.`;

async function login() {
  const attempts = [
    { url: `${BASE}/api/auth/login`, email: 'recruiter01.devseed@example.com', password: 'DevSeed#2026' },
    { url: `${BASE}/api/login/password`, email: 'recruiter01.devseed@example.com', password: 'DevSeed#2026' },
    { url: `${BASE}/api/auth/login`, email: 'test@metaforgeit.com', password: 'TestPassword123' },
  ];

  for (const { url, email, password } of attempts) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      const token = data?.data?.token || data?.token;
      if (res.ok && token) {
        console.log(`✅ Logged in via ${url}`);
        return token;
      }
    } catch {
      // try next
    }
  }
  throw new Error('Could not log in. Use the app UI while signed in, or set TEST_JWT in .env');
}

async function testExtractJd(token) {
  console.log('\n📋 Testing JD extraction (pasted text)...');
  const res = await fetch(`${BASE}/api/ai/extract-jd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text: SAMPLE_JD }),
  });

  const body = await res.json().catch(() => ({}));
  console.log(`Status: ${res.status}`);

  if (!res.ok) {
    console.error('❌ Failed:', body.message || body.error || JSON.stringify(body));
    process.exit(1);
  }

  const data = body.data || body;
  console.log('\n✅ Extraction succeeded\n');
  console.log('--- Key fields ---');
  const fields = [
    'jobTitle',
    'location',
    'experience',
    'experienceLevel',
    'positions',
    'employmentType',
    'workMode',
    'skills',
    'technologies',
    'noticePeriod',
    'budgetAmountInr',
    'budgetCurrency',
    'priority',
    'demandType',
    'extractionSource',
    'totalRolesDetected',
    'usedFallbackParser',
  ];
  for (const key of fields) {
    const val = data[key];
    if (val !== undefined && val !== null && val !== '') {
      console.log(`${key}:`, Array.isArray(val) ? val.join(', ') : val);
    }
  }
  console.log('\n--- Full response data ---');
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  console.log(`🔍 JD Extract test → ${BASE}/api/ai/extract-jd\n`);

  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`❌ Backend not reachable at ${BASE}. Start it with: cd backend && npm run dev`);
    process.exit(1);
  }
  console.log('✅ Backend health OK');

  const token = process.env.TEST_JWT?.trim() || (await login());
  await testExtractJd(token);
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
