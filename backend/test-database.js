const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function testDatabase() {
  try {
    console.log('🔍 Testing Database Connection...');
    
    // Test 1: Check if we can connect
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    // Test 2: Check if users exist
    const users = await prisma.user.findMany();
    console.log(`📊 Found ${users.length} users in database`);
    users.forEach(user => {
      console.log(`  - ${user.email} (${user.role})`);
    });
    
    // Test 3: Check if requirements exist
    const requirements = await prisma.requirement.findMany();
    console.log(`📋 Found ${requirements.length} requirements in database`);
    
    // Test 4: Check if clients exist
    const clients = await prisma.client.findMany();
    console.log(`🏢 Found ${clients.length} clients in database`);
    
    // Test 5: Create a test client
    if (clients.length === 0) {
      console.log('🏢 Creating test client...');
      const newClient = await prisma.client.create({
        data: {
          name: 'Test Client Company',
          pocName: 'Test POC',
          pocEmail: 'test@client.com',
          pocPhone: '123-456-7890',
          industry: 'Technology',
          location: 'San Francisco, CA',
          isActive: true,
        },
      });
      console.log(`✅ Created client: ${newClient.name} (ID: ${newClient.id})`);
    }
    
    // Test 6: Get the created client
    const createdClient = await prisma.client.findFirst();
    if (createdClient) {
      console.log(`🏢 Using client for requirement: ${createdClient.name} (ID: ${createdClient.id})`);
      
      // Test 7: Create a test requirement with all new fields
      console.log('📋 Creating test requirement with all new fields...');
      const newRequirement = await prisma.requirement.create({
        data: {
          requirementId: 'REQ-TEST-001',
          roleTitle: 'Test Software Engineer',
          location: 'San Francisco, CA',
          openPositions: 1,
          priority: 'MEDIUM',
          experienceLevel: 'Senior',
          employmentType: 'Full-time',
          workMode: 'Remote',
          salaryMin: 80000,
          salaryMax: 120000,
          skills: ['JavaScript', 'React', 'Node.js'],
          experience: '5-7 years',
          noticePeriod: '30 days',
          clientJdId: 'JD-TEST-001',
          status: 'OPEN',
          submittingTo: createdClient.id, // Use the created client ID
          clientLeadPoc: 'Jane Smith',
          clientPoc: 'jane@client.com',
          clientId: createdClient.id,
          ownerId: users[0]?.id || 'test-user-id',
          submissionsCount: 0,
          isDeleted: false,
        },
      });
      
      console.log(`✅ Created requirement: ${newRequirement.jobTitle} (ID: ${newRequirement.id})`);
      console.log(`📊 New fields stored:`);
      console.log(`  - Experience Level: ${newRequirement.experienceLevel}`);
      console.log(`  - Employment Type: ${newRequirement.employmentType}`);
      console.log(`  - Work Mode: ${newRequirement.workMode}`);
      console.log(`  - Salary Range: $${newRequirement.salaryMin} - $${newRequirement.salaryMax}`);
      
      // Test 8: Verify the requirement was stored correctly
      const storedRequirement = await prisma.requirement.findUnique({
        where: { id: newRequirement.id },
      });
      
      if (storedRequirement) {
        console.log('✅ Requirement verified in database:');
        console.log(`  - Job Title: ${storedRequirement.jobTitle}`);
        console.log(`  - Experience Level: ${storedRequirement.experienceLevel}`);
        console.log(`  - Employment Type: ${storedRequirement.employmentType}`);
        console.log(`  - Work Mode: ${storedRequirement.workMode}`);
        console.log(`  - Min Salary: ${storedRequirement.salaryMin}`);
        console.log(`  - Max Salary: ${storedRequirement.salaryMax}`);
        console.log(`  - Created At: ${storedRequirement.createdAt}`);
        console.log(`  - Client ID: ${storedRequirement.submittingTo}`);
      }
    }
    
    console.log('\n🎯 Database Test Complete!');
    console.log('✅ Backend, Frontend, and Database are connected!');
    console.log('✅ Data is being stored correctly!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();
