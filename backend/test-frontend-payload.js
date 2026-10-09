// Test to understand the exact frontend payload structure
const fetch = require('node-fetch').default || require('node-fetch');

async function testFrontendPayload() {
  console.log('🔍 Testing Frontend Payload Structure...\n');
  
  // Simulate the exact payload the frontend sends
  const testPayload = {
    // These are the exact field names from the frontend form
    jobTitle: 'Senior Software Engineer',
    locations: ['San Francisco, CA'],
    overallExperienceCustom: '5-8 years',
    experienceLevel: 'Senior',
    employmentType: 'Full-time',
    workMode: 'Hybrid',
    salaryMin: '150000',
    salaryMax: '200000',
    noticePeriod: '30 days',
    skills: ['JavaScript', 'React', 'Node.js'],
    technologies: ['JavaScript', 'React', 'Node.js'],
    priority: 'High',
    positions: 2,
    submittingTo: 'Direct Client',
    clientJdId: 'JD-2024-001',
    clientLeadPoc: 'John Doe',
    clientPoc: 'john.doe@company.com'
  };
  
  console.log('📋 Test Payload:', JSON.stringify(testPayload, null, 2));
  
  // Test the backend endpoint
  try {
    const response = await fetch('http://localhost:8000/api/requirements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbW4ycWxlbm4wMDAwdnZlNTduMmRnZ3VpIiwiZW1haWwiOiJ0ZXN0QG1ldGFmb3JnZWl0LmNvbSIsInJvbGUiOiJSRUNSVUlURVIiLCJpYXQiOjE3NzQyNDk5NzMsImV4cCI6MTc3NDg1NDc3M30.wXZxN5bYeSatV9tdFtdwl5nLtsMAkL-dzKIX6D586rk',
      },
      body: JSON.stringify(testPayload),
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Success:', JSON.stringify(result, null, 2));
    } else {
      const error = await response.text();
      console.log('❌ Error:', error);
    }
  } catch (error) {
    console.log('💥 Network Error:', error.message);
  }
}

testFrontendPayload();
