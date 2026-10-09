const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function cleanDatabase() {
  console.log('🧹 Starting Database Cleanup...\n');
  
  try {
    // Get count before cleanup
    console.log('📊 Getting current data counts...');
    
    const requirementsCount = await prisma.requirement.count();
    const usersCount = await prisma.user.count();
    const submissionsCount = await prisma.submission.count();
    const assignmentsCount = await prisma.requirementAssignment.count();
    
    console.log(`📋 Requirements: ${requirementsCount}`);
    console.log(`👥 Users: ${usersCount}`);
    console.log(`📤 Submissions: ${submissionsCount}`);
    console.log(`🔄 Assignments: ${assignmentsCount}`);
    
    // Clean up in correct order (respect foreign key constraints)
    console.log('\n🗑️ Cleaning up data...');
    
    // 1. Delete submissions first (depends on assignments and requirements)
    console.log('1️⃣ Deleting submissions...');
    const deletedSubmissions = await prisma.submission.deleteMany({});
    console.log(`   ✅ Deleted ${deletedSubmissions.count} submissions`);
    
    // 2. Delete requirement assignments
    console.log('2️⃣ Deleting requirement assignments...');
    const deletedAssignments = await prisma.requirementAssignment.deleteMany({});
    console.log(`   ✅ Deleted ${deletedAssignments.count} assignments`);
    
    // 3. Delete requirements
    console.log('3️⃣ Deleting requirements...');
    const deletedRequirements = await prisma.requirement.deleteMany({});
    console.log(`   ✅ Deleted ${deletedRequirements.count} requirements`);
    
    // 4. Keep users but reset their login data (optional - uncomment if needed)
    console.log('4️⃣ Keeping users (preserving login credentials)');
    console.log('   ✅ Users preserved for login');
    
    // Optional: Reset users (uncomment if you want to clean users too)
    /*
    console.log('4️⃣ Deleting users...');
    const deletedUsers = await prisma.user.deleteMany({});
    console.log(`   ✅ Deleted ${deletedUsers.count} users`);
    */
    
    console.log('\n🎉 Database cleanup completed successfully!');
    
    // Verify cleanup
    console.log('\n📊 Verification - New counts:');
    const finalRequirements = await prisma.requirement.count();
    const finalUsers = await prisma.user.count();
    const finalSubmissions = await prisma.submission.count();
    const finalAssignments = await prisma.requirementAssignment.count();
    
    console.log(`📋 Requirements: ${finalRequirements} (was ${requirementsCount})`);
    console.log(`👥 Users: ${finalUsers} (was ${usersCount})`);
    console.log(`📤 Submissions: ${finalSubmissions} (was ${submissionsCount})`);
    console.log(`🔄 Assignments: ${finalAssignments} (was ${assignmentsCount})`);
    
    console.log('\n✅ Database is now clean and ready for fresh demo data!');
    
  } catch (error) {
    console.error('💥 Error cleaning database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the cleanup
cleanDatabase()
  .then(() => {
    console.log('\n🚀 Database cleanup process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Database cleanup failed:', error);
    process.exit(1);
  });
