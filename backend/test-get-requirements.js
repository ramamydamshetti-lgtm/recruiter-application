// Test GET requirements API to see what's returned
const fetch = require('node-fetch').default || require('node-fetch');

async function testGetRequirements() {
  console.log('🔍 Testing GET Requirements API...\n');
  
  try {
    const response = await fetch('http://localhost:8000/api/requirements', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbW4ycWxlbm4wMDAwdnZlNTduMmRnZ3VpIiwiZW1haWwiOiJ0ZXN0QG1ldGFmb3JnZWl0LmNvbSIsInJvbGUiOiJSRUNSVUlREVIiLCJpYXQiOjE3NzQyNTI1ODMsImV4cCI6MTc3NDg1NzM4M30.4j7N2CfiD-uxzT5D3Tkagd2nKBaRj-YwJqw9QCOCHRg',
      },
    });

    console.log('📊 Response Status:', response.status);
    console.log('📊 Response OK:', response.ok);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Full Response:', JSON.stringify(data, null, 2));
      console.log('📋 Requirements Count:', data.data?.requirements?.length || 0);
      console.log('📋 Requirements Array:', data.data?.requirements || []);
    } else {
      const error = await response.text();
      console.log('❌ Error Response:', error);
    }
  } catch (error) {
    console.log('💥 Network Error:', error.message);
  }
}

testGetRequirements();
