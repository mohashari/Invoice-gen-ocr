import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { login, refreshTokens } from '../services/auth.service'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    try {
      const result = await login(app, body.data.email, body.data.password)
      reply
        .setCookie('refresh_token', result.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/api/auth',
          maxAge: 7 * 24 * 60 * 60,
        })
        .send({ accessToken: result.accessToken, user: result.user })
    } catch {
      reply.code(401).send({ error: 'Invalid credentials' })
    }
  })

  app.post('/refresh', async (req, reply) => {
    const token = req.cookies?.refresh_token
    if (!token) return reply.code(401).send({ error: 'No refresh token' })
    try {
      const tokens = await refreshTokens(app, token)
      reply
        .setCookie('refresh_token', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/api/auth',
          maxAge: 7 * 24 * 60 * 60,
        })
        .send({ accessToken: tokens.accessToken })
    } catch {
      reply.code(401).send({ error: 'Invalid refresh token' })
    }
  })

  app.post('/logout', async (_req, reply) => {
    reply.clearCookie('refresh_token', { path: '/api/auth' }).send({ message: 'Logged out' })
  })
}
