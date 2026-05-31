import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } } as any)

async function main() {
  const hash = await bcrypt.hash('admin123', 10)

  await prisma.user.upsert({
    where: { email: 'admin@ampere.com' },
    update: {},
    create: { name: 'Gabriel (Admin)', email: 'admin@ampere.com', passwordHash: hash, role: 'ADMIN', unit: 'Natal' },
  })

  await prisma.user.upsert({
    where: { email: 'gestor@ampere.com' },
    update: {},
    create: { name: 'Gestor Natal', email: 'gestor@ampere.com', passwordHash: hash, role: 'MANAGER', unit: 'Natal' },
  })

  await prisma.user.upsert({
    where: { email: 'vendedor@ampere.com' },
    update: {},
    create: { name: 'Vendedor Teste', email: 'vendedor@ampere.com', passwordHash: hash, role: 'EMPLOYEE', unit: 'Natal' },
  })

  console.log('Seed concluído!')
  console.log('admin@ampere.com / admin123')
  console.log('gestor@ampere.com / admin123')
  console.log('vendedor@ampere.com / admin123')
}

main().finally(() => prisma.$disconnect())
