import { FastifyInstance } from 'fastify'
import { authenticate, authorize } from '../middlewares/auth.middleware'
import { prisma } from '../utils/db'

export async function userRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: authenticate }, async (req) => {
    const user = req.user as { sub: string }
    return prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
      select: { id: true, email: true, role: true, createdAt: true },
    })
  })

  app.get('/', { preHandler: authorize('ADMIN') }, async (req, reply) => {
    return prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
  })
}
