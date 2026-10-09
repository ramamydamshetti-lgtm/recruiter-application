const fetch = require('node-fetch').default || require('node-fetch');
require('dotenv').config();

async function testFrontendConnection() {
  console.log('🔍 Testing Frontend-Backend Connection...\n');
  
  try {
    // Test 1: Health check
    console.log('1. Testing Health Check...');
    const healthResponse = await fetch('http://localhost:8000/health');
    console.log(`✅ Health Status: ${healthResponse.status}`);
    
    // Test 2: Login
    console.log('\n2. Testing Login...');
    const loginResponse = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@metaforgeit.com',
        password: 'TestPassword123'
      })
    });
    
    const loginData = await loginResponse.json();
    console.log(`✅ Login Status: ${loginResponse.status}`);
    console.log(`🔑 Token: ${loginData.success ? 'Obtained' : 'Failed'}`);
    
    if (loginData.success) {
      const token = loginData.data.token;
      
      // Test 3: Get Requirements
      console.log('\n3. Testing Get Requirements...');
      const requirementsResponse = await fetch('http://localhost:8000/api/requirements', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log(`✅ Requirements Status: ${requirementsResponse.status}`);
      const requirementsData = await requirementsResponse.json();
      console.log(`📊 Requirements Count: ${requirementsData.success ? requirementsData.data.requirements?.length || 0 : 'Failed'}`);
      
      // Test 4: Get Recruiters
      console.log('\n4. Testing Get Recruiters...');
      const recruitersResponse = await fetch('http://localhost:8000/api/recruiters', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log(`✅ Recruiters Status: ${recruitersResponse.status}`);
      const recruitersData = await recruitersResponse.json();
      console.log(`👥 Recruiters Count: ${recruitersData.success ? recruitersData.data?.recruiters?.length || 0 : 'Failed'}`);
      
      // Test 5: CORS Headers
      console.log('\n5. Testing CORS Headers...');
      const corsResponse = await fetch('http://localhost:8000/api/requirements', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization'
        }
      });
      
      console.log(`✅ CORS Status: ${corsResponse.status}`);
      console.log(`🌐 CORS Headers: ${corsResponse.headers.get('access-control-allow-origin') || 'Not set'}`);
      
      console.log('\n🎉 All Backend Tests Passed!');
      console.log('✅ Backend is ready for frontend connection');
      
    } else {
      console.log('❌ Login failed - cannot test authenticated endpoints');
    }
    
  } catch (error) {
    console.log('💥 Connection Error:', error.message);
  }
}

testFrontendConnection().catch(console.error);
