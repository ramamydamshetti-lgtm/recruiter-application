// Let me check the exact field names the frontend is sending
const fetch = require('node-fetch').default || require('node-fetch');

async function debugFrontendData() {
  console.log('🔍 Debugging Frontend Data Structure...\n');
  
  // This will help us understand the exact field names being sent
  console.log('📋 Expected Frontend Field Names:');
  console.log('- jobTitle (frontend) → roleTitle (backend)');
  console.log('- locations (frontend array) → location (backend string)');
  console.log('- overallExperienceCustom (frontend) → experience (backend)');
  console.log('- overallExperience (frontend) → experienceLevel (backend)');
  console.log('- employmentType (frontend) → employmentType (backend)');
  console.log('- workMode (frontend) → workMode (backend)');
  console.log('- salaryMin (frontend) → salaryMin (backend)');
  console.log('- salaryMax (frontend) → salaryMax (backend)');
  console.log('- noticePeriod (frontend) → noticePeriod (backend)');
  console.log('- skills (frontend array) → skills (backend array)');
  console.log('- technologies (frontend array) → technologies (backend array)');
  console.log('- priority (frontend) → priority (backend enum)');
  console.log('- positions (frontend) → openPositions (backend)');
  console.log('- submittingTo (frontend) → submittingTo (backend)');
  console.log('- clientJdId (frontend) → clientJdId (backend)');
  console.log('- clientLeadPoc (frontend) → clientLeadPoc (backend)');
  console.log('- clientPoc (frontend) → clientPoc (backend)');
  
  console.log('\n🎯 SOLUTION: Update backend to match exact frontend field names');
  console.log('The backend needs to map from frontend field names to database fields');
}

debugFrontendData();
