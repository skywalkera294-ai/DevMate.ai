import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'demo@devmate.ai';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name: 'Demo User',
        passwordHash: await hash('devmate123', 10),
        provider: 'email',
        plan: 'pro',
      },
    });
    console.log(`Seeded demo user: ${email} / devmate123`);
  } else {
    console.log('Demo user already exists.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
