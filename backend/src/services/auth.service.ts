import bcrypt from 'bcryptjs'
import { prisma } from '../utils/db'
import { FastifyInstance } from 'fastify'

export interface JwtPayload {
  sub: string
  email: string
  role: string
}

export async function login(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; user: object }> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error('Invalid credentials')

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new Error('Invalid credentials')

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role }

  const accessToken = app.jwt.sign(payload, { expiresIn: '15m' })
  const refreshToken = app.jwt.sign(payload, { expiresIn: '7d' })

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role },
  }
}

export async function refreshTokens(app: FastifyInstance, token: string) {
  const decoded = app.jwt.verify<JwtPayload>(token)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: decoded.sub } })
  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role }
  const accessToken = app.jwt.sign(payload, { expiresIn: '15m' })
  const refreshToken = app.jwt.sign(payload, { expiresIn: '7d' })
  return { accessToken, refreshToken }
}
