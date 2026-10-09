const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function cleanUsersDatabase() {
  console.log('🧹 Cleaning Users Database...\n');
  
  try {
    // Get count before cleanup
    console.log('📊 Getting current users count...');
    
    const usersCount = await prisma.user.count();
    console.log(`👥 Users: ${usersCount}`);
    
    // Clean up users database
    console.log('\n🗑️ Cleaning users database...');
    
    // Option 1: Delete all users (complete reset)
    console.log('1️⃣ Deleting all users...');
    const deletedUsers = await prisma.user.deleteMany({});
    console.log(`   ✅ Deleted ${deletedUsers.count} users`);
    
    // Option 2: Keep test user and recreate it (uncomment if you prefer this)
    /*
    console.log('1️⃣ Keeping test user, deleting others...');
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        email: {
          not: 'test@metaforgeit.com'
        }
      }
    });
    console.log(`   ✅ Deleted ${deletedUsers.count} users (kept test user)`);
    
    // Recreate test user with fresh data
    console.log('2️⃣ Recreating test user...');
    const testUser = await prisma.user.create({
      data: {
        email: 'test@metaforgeit.com',
        password: '$2b$12$LXv.kJtQeZq8jG9hWd5B5F3R', // TestPassword123 hashed
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
    console.log(`   ✅ Recreated test user: ${testUser.email}`);
    */
    
    console.log('\n✅ Users database cleanup completed!');
    
    // Verify cleanup
    console.log('\n📊 Verification - Final counts:');
    const finalUsers = await prisma.user.count();
    
    console.log(`👥 Users: ${finalUsers} (was ${usersCount})`);
    
    console.log('\n🎉 Users database is now clean!');
    
  } catch (error) {
    console.error('💥 Error cleaning users database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the users database cleanup
cleanUsersDatabase()
  .then(() => {
    console.log('\n🚀 Users database cleanup process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Users database cleanup failed:', error);
    process.exit(1);
  });
