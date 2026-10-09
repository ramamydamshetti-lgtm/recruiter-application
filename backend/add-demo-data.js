const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function addDemoData() {
  console.log('🎯 Adding Fresh Demo Data...\n');
  
  try {
    // 1. Get existing users
    console.log('👥 Getting existing users...');
    const users = await prisma.user.findMany();
    const testUser = users.find(u => u.email === 'test@metaforgeit.com');
    
    if (!testUser) {
      console.log('❌ Test user not found! Please run with existing test user');
      return;
    }
    
    console.log(`✅ Found test user: ${testUser.email}`);
    
    // 2. Add demo requirements
    console.log('\n📋 Adding demo requirements...');
    
    const demoRequirements = [
      {
        requirementId: 'REQ-DEMO-001',
        clientId: 'cmn07onzj0000cznq2szsuir5', // Existing client
        clientLeadPoc: 'Michael Chen',
        clientPoc: 'michael.chen@techcorp.com',
        roleTitle: 'Senior Software Engineer',
        location: 'San Francisco, CA',
        experience: '5-8 years',
        experienceLevel: 'Senior',
        employmentType: 'Full-time',
        workMode: 'Hybrid',
        salaryMin: 140000,
        salaryMax: 200000,
        skills: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'AWS'],
        technologies: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'AWS'],
        priority: 'HIGH',
        openPositions: 2,
        noticePeriod: '30 days',
        clientJdId: 'JD-2024-001',
        submittingTo: 'Direct Client',
        status: 'OPEN',
        assignment: 'UNASSIGNED',
        ownerId: testUser.id,
        assignedBy: testUser.id,
        assignedRecruiters: [],
        submissionsCount: 0,
        isDeleted: false,
        updatedBy: testUser.id,
      },
      {
        requirementId: 'REQ-DEMO-002',
        clientId: 'cmn07onzj0000cznq2szsuir5',
        clientLeadPoc: 'Sarah Johnson',
        clientPoc: 'sarah.johnson@fintech.com',
        roleTitle: 'Mobile App Developer',
        location: 'Austin, TX',
        experience: '4-6 years',
        experienceLevel: 'Senior',
        employmentType: 'Full-time',
        workMode: 'Remote',
        salaryMin: 130000,
        salaryMax: 180000,
        skills: ['React Native', 'iOS', 'Android', 'TypeScript', 'Firebase'],
        technologies: ['React Native', 'iOS', 'Android', 'TypeScript', 'Firebase'],
        priority: 'HIGH',
        openPositions: 3,
        noticePeriod: '21 days',
        clientJdId: 'JD-2024-003',
        submittingTo: 'Direct Client',
        status: 'OPEN',
        assignment: 'UNASSIGNED',
        ownerId: testUser.id,
        assignedBy: testUser.id,
        assignedRecruiters: [],
        submissionsCount: 0,
        isDeleted: false,
        updatedBy: testUser.id,
      },
      {
        requirementId: 'REQ-DEMO-003',
        clientId: 'cmn07onzj0000cznq2szsuir5',
        clientLeadPoc: 'Amanda Garcia',
        clientPoc: 'amanda.garcia@airesearch.com',
        roleTitle: 'AI/ML Engineer',
        location: 'Palo Alto, CA',
        experience: '5-10 years',
        experienceLevel: 'Senior',
        employmentType: 'Full-time',
        workMode: 'On-site',
        salaryMin: 150000,
        salaryMax: 220000,
        skills: ['Python', 'Deep Learning', 'Neural Networks', 'PyTorch', 'Computer Vision'],
        technologies: ['Python', 'Deep Learning', 'Neural Networks', 'PyTorch', 'Computer Vision'],
        priority: 'HIGH',
        openPositions: 2,
        noticePeriod: '30 days',
        clientJdId: 'JD-2024-010',
        submittingTo: 'Direct Client',
        status: 'OPEN',
        assignment: 'UNASSIGNED',
        ownerId: testUser.id,
        assignedBy: testUser.id,
        assignedRecruiters: [],
        submissionsCount: 0,
        isDeleted: false,
        updatedBy: testUser.id,
      }
    ];
    
    // Add requirements one by one to see progress
    for (let i = 0; i < demoRequirements.length; i++) {
      const req = demoRequirements[i];
      console.log(`   📋 Adding requirement ${i + 1}/${demoRequirements.length}: ${req.roleTitle}`);
      
      await prisma.requirement.create({
        data: req,
      });
      
      console.log(`      ✅ Created: ${req.requirementId}`);
    }
    
    console.log(`\n🎉 Successfully created ${demoRequirements.length} demo requirements!`);
    
    // 3. Verify data
    console.log('\n📊 Verification - Final counts:');
    const finalRequirements = await prisma.requirement.count();
    const finalUsers = await prisma.user.count();
    
    console.log(`📋 Requirements: ${finalRequirements}`);
    console.log(`👥 Users: ${finalUsers}`);
    console.log(`📤 Submissions: 0`);
    
    console.log('\n🚀 Demo data setup completed!');
    console.log('✅ Database is ready for your Monday demo!');
    
    console.log('\n📋 Demo Requirements Created:');
    demoRequirements.forEach((req, index) => {
      console.log(`${index + 1}. ${req.roleTitle} - ${req.location} - $${req.salaryMin.toLocaleString()}-$${req.salaryMax.toLocaleString()}`);
    });
    
  } catch (error) {
    console.error('💥 Error adding demo data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the demo data setup
addDemoData()
  .then(() => {
    console.log('\n🎯 Demo data setup process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Demo data setup failed:', error);
    process.exit(1);
  });
