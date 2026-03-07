import { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate } from '../middlewares/auth.middleware'
import {
  uploadAndEnqueue,
  listInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  getInvoicePdfUrl,
} from '../services/invoice.service'
import { generatePdf } from '../services/pdf.service'
import fileType from 'file-type'

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/tiff', 'application/pdf'])

export async function invoiceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.post('/upload', async (req, reply) => {
    const user = req.user as { sub: string; role: string }
    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'No file provided' })

    const buffer = await data.toBuffer()

    const detected = await fileType.fromBuffer(buffer)
    const mime = detected?.mime || data.mimetype
    if (!ALLOWED_MIME.has(mime)) {
      return reply.code(415).send({ error: 'Unsupported file type. Allowed: PNG, JPG, TIFF, PDF' })
    }

    if (buffer.length > 20 * 1024 * 1024) {
      return reply.code(413).send({ error: 'File too large. Max 20MB' })
    }

    const invoice = await uploadAndEnqueue(user.sub, buffer, data.filename, mime)
    return reply.code(201).send(invoice)
  })

  app.get('/', async (req: FastifyRequest<{ Querystring: { page?: string; limit?: string; status?: string; search?: string } }>, reply) => {
    const user = req.user as { sub: string; role: string }
    const page = Number(req.query.page) || 1
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    return listInvoices(user.sub, user.role, page, limit, req.query.status, req.query.search)
  })

  app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const user = req.user as { sub: string; role: string }
    const invoice = await getInvoiceById(req.params.id, user.sub, user.role)
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found' })
    return invoice
  })

  app.put('/:id', async (req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply) => {
    const user = req.user as { sub: string; role: string }
    const result = await updateInvoice(req.params.id, user.sub, user.role, req.body)
    if (!result) return reply.code(404).send({ error: 'Invoice not found' })
    return result
  })

  app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const user = req.user as { sub: string; role: string }
    const ok = await deleteInvoice(req.params.id, user.sub, user.role)
    if (!ok) return reply.code(404).send({ error: 'Invoice not found' })
    return reply.code(204).send()
  })

  app.post('/:id/generate-pdf', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const user = req.user as { sub: string; role: string }
    const invoice = await getInvoiceById(req.params.id, user.sub, user.role)
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found' })
    const pdfUrl = await generatePdf(req.params.id)
    return { pdfUrl }
  })

  app.get('/:id/pdf', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const user = req.user as { sub: string; role: string }
    const url = await getInvoicePdfUrl(req.params.id, user.sub, user.role)
    if (!url) return reply.code(404).send({ error: 'PDF not found' })
    return { url }
  })

  app.get('/:id/status', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const user = req.user as { sub: string; role: string }
    const invoice = await getInvoiceById(req.params.id, user.sub, user.role)
    if (!invoice) return reply.code(404).send({ error: 'Not found' })

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.flushHeaders()

    const send = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    send({ status: invoice.status, ocrJob: invoice.ocrJob })

    if (['CONFIRMED', 'ERROR', 'EXTRACTED'].includes(invoice.status)) {
      reply.raw.end()
      return reply
    }

    const interval = setInterval(async () => {
      try {
        const updated = await getInvoiceById(req.params.id, user.sub, user.role)
        if (updated) {
          send({ status: updated.status, ocrJob: updated.ocrJob })
          if (['CONFIRMED', 'ERROR', 'EXTRACTED'].includes(updated.status)) {
            clearInterval(interval)
            reply.raw.end()
          }
        }
      } catch {
        clearInterval(interval)
        reply.raw.end()
      }
    }, 2000)

    req.raw.on('close', () => clearInterval(interval))
    return reply
  })
}
