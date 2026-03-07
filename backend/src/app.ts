import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import fastifyMultipart from '@fastify/multipart'
import fastifyRateLimit from '@fastify/rate-limit'
import { authRoutes } from './routes/auth'
import { invoiceRoutes } from './routes/invoices'
import { userRoutes } from './routes/users'
import { internalRoutes } from './routes/internal'
import { prisma } from './utils/db'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  })

  await app.register(fastifyHelmet, { contentSecurityPolicy: false })
  await app.register(fastifyCors, {
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  })
  await app.register(fastifyCookie)
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'fallback_secret_change_me',
    cookie: { cookieName: 'refresh_token', signed: false },
  })
  await app.register(fastifyMultipart, {
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  })
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(invoiceRoutes, { prefix: '/api/invoices' })
  await app.register(userRoutes, { prefix: '/api/users' })
  await app.register(internalRoutes, { prefix: '/internal' })

  return app
}
