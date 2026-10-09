const fetch = require('node-fetch').default || require('node-fetch');
require('dotenv').config();

async function testRequirementFormats() {
  // First login to get token
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
  
  console.log('🔑 Token obtained:', token.substring(0, 50) + '...');
  
  // Test different data formats
  const testFormats = [
    {
      name: 'MINIMAL DATA',
      data: {
        roleTitle: 'Test Engineer'
      }
    },
    {
      name: 'BASIC DATA',
      data: {
        roleTitle: 'Software Engineer',
        location: 'San Francisco',
        openPositions: 1,
        priority: 'MEDIUM'
      }
    },
    {
      name: 'COMPLETE DATA',
      data: {
        requirementId: 'REQ-TEST-001',
        roleTitle: 'Senior Software Engineer',
        location: 'New York, NY',
        openPositions: 2,
        priority: 'HIGH',
        experienceLevel: 'Senior',
        employmentType: 'Full-time',
        workMode: 'Remote',
        salaryMin: 120000,
        salaryMax: 180000,
        skills: ['JavaScript', 'React', 'Node.js'],
        experience: '5+ years',
        noticePeriod: '30 days',
        clientJdId: 'JD-TEST-001',
        submittingTo: 'Direct Client',
        clientLeadPoc: 'John Doe',
        clientPoc: 'john@client.com',
        clientId: 'cmn07onzj0000cznq2szsuir5'
      }
    },
    {
      name: 'FRONTEND FORMAT (what your app sends)',
      data: {
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
        jobTitle: 'Test Job',
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
      }
    }
  ];

  for (const test of testFormats) {
    console.log(`\n🧪 Testing: ${test.name}`);
    console.log('📤 Data:', JSON.stringify(test.data, null, 2));
    
    try {
      const response = await fetch('http://localhost:8000/api/requirements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(test.data)
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ SUCCESS:', result.message);
        console.log('📋 Created ID:', result.data.id);
      } else {
        console.log('❌ FAILED:', result.message);
        console.log('🔍 Error details:', result);
      }
    } catch (error) {
      console.log('💥 NETWORK ERROR:', error.message);
    }
  }
}

testRequirementFormats().catch(console.error);
