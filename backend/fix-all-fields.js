// Comprehensive fix for all frontend field mapping issues
const fetch = require('node-fetch').default || require('node-fetch');

async function testAllFieldMappings() {
  console.log('🔍 Testing All Frontend Field Mappings...\n');
  
  // Test 1: Exact frontend form data structure
  const frontendData = {
    // From CreateRequirementPage form
    jobTitle: 'Full Stack Developer',
    locations: ['New York, NY', 'Remote'],
    overallExperienceCustom: '3-5 years',
    experienceLevel: 'Mid-level',
    employmentType: 'Full-time',
    workMode: 'Hybrid',
    salaryMin: '120000',
    salaryMax: '160000',
    noticePeriod: '2 weeks',
    skills: ['React', 'Node.js', 'TypeScript'],
    technologies: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
    priority: 'High',
    positions: 3,
    submittingTo: 'Direct Client',
    clientJdId: 'JD-2024-123',
    clientLeadPoc: 'Alice Johnson',
    clientPoc: 'alice@techcorp.com'
  };
  
  console.log('📋 Frontend Data:', JSON.stringify(frontendData, null, 2));
  
  // Test 2: What backend should map to
  const backendMapping = {
    requirementId: `REQ-${Date.now()}`,
    clientId: 'cmn07onzj0000cznq2szsuir5',
    clientLeadPoc: frontendData.clientLeadPoc,
    clientPoc: frontendData.clientPoc,
    roleTitle: frontendData.jobTitle,
    location: Array.isArray(frontendData.locations) ? frontendData.locations.join(', ') : frontendData.location,
    experience: frontendData.overallExperienceCustom || frontendData.experience,
    experienceLevel: frontendData.experienceLevel,
    employmentType: frontendData.employmentType,
    workMode: frontendData.workMode,
    salaryMin: parseFloat(frontendData.salaryMin) || 0,
    salaryMax: parseFloat(frontendData.salaryMax) || 0,
    noticePeriod: frontendData.noticePeriod,
    skills: Array.isArray(frontendData.skills) ? frontendData.skills : [],
    technologies: Array.isArray(frontendData.technologies) ? frontendData.technologies : [],
    priority: frontendData.priority?.toUpperCase(),
    openPositions: parseInt(frontendData.positions) || 1,
    submittingTo: frontendData.submittingTo,
    clientJdId: frontendData.clientJdId,
    status: 'OPEN',
    assignment: 'UNASSIGNED',
    ownerId: 'cmn2qlenn0000vve57n2dggui',
    assignedBy: 'cmn2qlenn0000vve57n2dggui',
    assignedRecruiters: [],
    submissionsCount: 0,
    isDeleted: false,
    updatedBy: 'cmn2qlenn0000vve57n2dggui',
  };
  
  console.log('🎯 Backend Mapping:', JSON.stringify(backendMapping, null, 2));
  console.log('\n✅ SOLUTION: Update backend to handle both array and string formats');
  console.log('✅ SOLUTION: Check for both locations (array) and location (string)');
  console.log('✅ SOLUTION: Parse salaryMin/salaryMax as numbers');
  console.log('✅ SOLUTION: Parse positions as integer');
}

testAllFieldMappings();
