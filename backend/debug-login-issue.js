const fetch = require('node-fetch').default || require('node-fetch');

async function debugLoginIssue() {
  console.log('🔍 Debugging Login Issue...\n');
  
  try {
    // Test 1: Direct backend call (this works)
    console.log('1. Testing direct backend call...');
    const directResponse = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@metaforgeit.com',
        password: 'TestPassword123'
      }),
    });
    
    console.log(`✅ Direct Call Status: ${directResponse.status}`);
    
    // Test 2: Call with CORS headers (simulate frontend)
    console.log('\n2. Testing with CORS headers...');
    const corsResponse = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
        'Referer': 'http://localhost:3000/',
      },
      body: JSON.stringify({
        email: 'test@metaforgeit.com',
        password: 'TestPassword123'
      }),
    });
    
    console.log(`✅ CORS Call Status: ${corsResponse.status}`);
    
    // Test 3: Check if frontend can reach backend
    console.log('\n3. Testing frontend to backend connectivity...');
    try {
      const healthResponse = await fetch('http://localhost:8000/health', {
        method: 'GET',
        headers: {
          'Origin': 'http://localhost:3000',
        },
      });
      console.log(`✅ Health Check Status: ${healthResponse.status}`);
      console.log(`✅ CORS Headers: ${healthResponse.headers.get('access-control-allow-origin')}`);
    } catch (error) {
      console.log(`❌ Health Check Failed: ${error.message}`);
    }
    
    // Test 4: Check frontend environment
    console.log('\n4. Environment check...');
    console.log(`🌐 Backend URL: http://localhost:8000`);
    console.log(`🌐 Frontend URL: http://localhost:3000`);
    console.log(`🔑 Test Credentials: test@metaforgeit.com / TestPassword123`);
    
    // Test 5: Simulate exact frontend request
    console.log('\n5. Simulating exact frontend request...');
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    console.log(`📡 API_BASE_URL: ${API_BASE_URL}`);
    
    const frontendSimulation = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@metaforgeit.com',
        password: 'TestPassword123'
      }),
    });
    
    console.log(`✅ Frontend Simulation Status: ${frontendSimulation.status}`);
    
    if (frontendSimulation.ok) {
      const data = await frontendSimulation.json();
      console.log('✅ Frontend Simulation Response:', JSON.stringify(data, null, 2));
    } else {
      const errorText = await frontendSimulation.text();
      console.log('❌ Frontend Simulation Error:', errorText);
    }
    
  } catch (error) {
    console.log('💥 Debug Error:', error.message);
    console.log('💥 Full Error:', error);
  }
}

debugLoginIssue().catch(console.error);
