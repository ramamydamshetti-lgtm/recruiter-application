const fetch = require('node-fetch').default || require('node-fetch');

async function testFrontendLogin() {
  console.log('🔍 Testing Frontend Login...\n');
  
  try {
    // Test the exact same way the frontend does it
    const API_BASE_URL = 'http://localhost:8000';
    
    console.log('1. Testing login endpoint...');
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@metaforgeit.com',
        password: 'TestPassword123'
      }),
    });

    console.log(`📊 Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error Response:', errorText);
      return;
    }

    const data = await response.json();
    console.log('✅ Login Response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.data.token) {
      console.log('🔑 Token obtained successfully!');
      
      // Test the /me endpoint
      console.log('\n2. Testing /me endpoint...');
      const meResponse = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.data.token}`,
        },
      });
      
      console.log(`📊 /me Status: ${meResponse.status}`);
      
      if (meResponse.ok) {
        const meData = await meResponse.json();
        console.log('✅ User Data:', JSON.stringify(meData, null, 2));
      } else {
        const meError = await meResponse.text();
        console.log('❌ /me Error:', meError);
      }
      
    } else {
      console.log('❌ Login failed - no token in response');
    }
    
  } catch (error) {
    console.log('💥 Network Error:', error.message);
    console.log('💥 Full Error:', error);
  }
}

testFrontendLogin().catch(console.error);
