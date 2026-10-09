const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function deleteDemoData() {
  console.log('🗑️ Deleting Demo Data...\n');
  
  try {
    // Get count before deletion
    console.log('📊 Getting current data counts...');
    
    const requirementsCount = await prisma.requirement.count();
    const usersCount = await prisma.user.count();
    
    console.log(`📋 Requirements: ${requirementsCount}`);
    console.log(`👥 Users: ${usersCount}`);
    
    // Delete demo requirements
    console.log('\n🗑️ Deleting demo requirements...');
    const deletedRequirements = await prisma.requirement.deleteMany({
      where: {
        requirementId: {
          startsWith: 'REQ-DEMO-'
        }
      }
    });
    console.log(`   ✅ Deleted ${deletedRequirements.count} demo requirements`);
    
    console.log('\n✅ Demo data deletion completed!');
    
    // Verify deletion
    console.log('\n📊 Verification - New counts:');
    const finalRequirements = await prisma.requirement.count();
    const finalUsers = await prisma.user.count();
    
    console.log(`📋 Requirements: ${finalRequirements} (was ${requirementsCount})`);
    console.log(`👥 Users: ${finalUsers} (was ${usersCount})`);
    
    console.log('\n🎉 Demo data successfully removed!');
    
  } catch (error) {
    console.error('💥 Error deleting demo data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the demo data deletion
deleteDemoData()
  .then(() => {
    console.log('\n🚀 Demo data deletion process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Demo data deletion failed:', error);
    process.exit(1);
  });
