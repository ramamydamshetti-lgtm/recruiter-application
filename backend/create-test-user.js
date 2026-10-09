const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function createTestUser() {
  console.log('👥 Creating Test User...\n');
  
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'test@metaforgeit.com' }
    });
    
    if (existingUser) {
      console.log('✅ Test user already exists!');
      return;
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash('TestPassword123', 10);
    
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'test@metaforgeit.com',
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'User',
        role: 'RECRUITER',
        avatar: null,
        phone: null,
        location: null,
        bio: null,
        isActive: true,
        emailVerified: true,
      }
    });
    
    console.log('✅ Test user created successfully!');
    console.log(`📧 Email: ${user.email}`);
    console.log(`👤 Name: ${user.firstName} ${user.lastName}`);
    console.log(`🔑 Role: ${user.role}`);
    
  } catch (error) {
    console.error('💥 Error creating test user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the user creation
createTestUser()
  .then(() => {
    console.log('\n🎉 Test user creation completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test user creation failed:', error);
    process.exit(1);
  });
