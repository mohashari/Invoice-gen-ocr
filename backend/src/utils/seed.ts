import { prisma } from './db'
import bcrypt from 'bcryptjs'

async function seed() {
  const passwordHash = await bcrypt.hash('Admin1234!', 12)

  await prisma.user.upsert({
    where: { email: 'admin@invoice.local' },
    update: {},
    create: {
      email: 'admin@invoice.local',
      passwordHash,
      role: 'ADMIN',
    },
  })

  await prisma.user.upsert({
    where: { email: 'accountant@invoice.local' },
    update: {},
    create: {
      email: 'accountant@invoice.local',
      passwordHash: await bcrypt.hash('Accountant1234!', 12),
      role: 'ACCOUNTANT',
    },
  })

  console.log('Seed complete.')
  await prisma.$disconnect()
}

seed().catch(console.error)
