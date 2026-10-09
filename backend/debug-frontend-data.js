const fetch = require('node-fetch').default || require('node-fetch');
require('dotenv').config();

async function debugFrontendData() {
  // Login
  const loginResponse = await fetch('http://localhost:8000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@metaforgeit.com',
      password: 'TestPassword123'
    })
  });
  
  const loginData = await loginResponse.json();
  const token = loginData.data.token;
  
  console.log('🔍 Testing frontend data format...\n');
  
  // Test the exact format your frontend sends
  const frontendData = {
    jobId: '',
    demandReceivedDate: '',
    internalPoc: '',
    submittingTo: 'Direct Client',
    clientJdId: '',
    jobStatus: 'Open',
    demandType: 'Single',
    positions: 1,
    skills: [],
    technologies: [],
    jdDescription: '',
    clientLeadPoc: '',
    clientPoc: '',
    jobTitle: 'Test Job From Frontend',
    closedDate: '',
    locations: [],
    overallExperience: '',
    overallExperienceCustom: '',
    noticePeriod: '',
    priority: 'Medium',
    experienceLevel: 'Senior',
    employmentType: 'Full-time',
    workMode: 'Remote',
    salaryMin: 80000,
    salaryMax: 120000
  };
  
  console.log('📤 Frontend Data:', JSON.stringify(frontendData, null, 2));
  
  try {
    const response = await fetch('http://localhost:8000/api/requirements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(frontendData)
    });
    
    const result = await response.json();
    console.log('📥 Response:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ SUCCESS! Frontend data accepted');
    } else {
      console.log('❌ FAILED! Frontend data rejected');
      console.log('🔍 Error:', result.message);
    }
  } catch (error) {
    console.log('💥 ERROR:', error.message);
  }
  
  // Test with minimal frontend data
  console.log('\n🔍 Testing minimal frontend data...\n');
  
  const minimalData = {
    jobTitle: 'Minimal Test Job',
    priority: 'Medium'
  };
  
  console.log('📤 Minimal Data:', JSON.stringify(minimalData, null, 2));
  
  try {
    const response = await fetch('http://localhost:8000/api/requirements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(minimalData)
    });
    
    const result = await response.json();
    console.log('📥 Response:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ SUCCESS! Minimal data accepted');
    } else {
      console.log('❌ FAILED! Minimal data rejected');
      console.log('🔍 Error:', result.message);
    }
  } catch (error) {
    console.log('💥 ERROR:', error.message);
  }
}

debugFrontendData().catch(console.error);
