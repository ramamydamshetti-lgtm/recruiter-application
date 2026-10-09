const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createClient() {
  try {
    const client = await prisma.client.create({
      data: {
        name: 'Test Client',
        industry: 'Technology',
        location: 'San Francisco, CA',
        pocName: 'John Doe',
        pocEmail: 'john@test.com',
        pocPhone: '123-456-7890',
        isActive: true,
      }
    });
    console.log('Client created:', client.id);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createClient();
