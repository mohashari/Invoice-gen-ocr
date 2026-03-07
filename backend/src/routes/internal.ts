import { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../utils/db'

interface OcrCallbackBody {
  invoiceId: string
  status: 'done' | 'failed'
  errorMsg?: string
  confidence?: number
  invoiceData?: Record<string, unknown>
  lineItems?: Array<Record<string, unknown>>
}

export async function internalRoutes(app: FastifyInstance) {
  app.post('/ocr-callback', async (req: FastifyRequest<{ Body: OcrCallbackBody }>, reply) => {
    const { invoiceId, status, errorMsg, confidence, invoiceData, lineItems } = req.body

    if (!invoiceId) return reply.code(400).send({ error: 'invoiceId required' })

    await prisma.$transaction(async (tx) => {
      await tx.ocrJob.updateMany({
        where: { invoiceId },
        data: {
          status: status === 'done' ? 'DONE' : 'FAILED',
          errorMsg: errorMsg || null,
          finishedAt: new Date(),
        },
      })

      if (status === 'done' && invoiceData) {
        // Normalize date strings to ISO DateTime and coerce numerics
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const safeData: any = { ...invoiceData }
        for (const dateField of ['issueDate', 'dueDate']) {
          if (safeData[dateField] && typeof safeData[dateField] === 'string') {
            const d = new Date(safeData[dateField])
            safeData[dateField] = isNaN(d.getTime()) ? null : d.toISOString()
          }
        }
        for (const numField of ['subtotal', 'taxAmount', 'totalAmount']) {
          if (safeData[numField] !== null && safeData[numField] !== undefined) {
            const n = Number(safeData[numField])
            safeData[numField] = isNaN(n) ? null : n
          }
        }
        await tx.invoiceData.upsert({
          where: { invoiceId },
          update: safeData,
          create: { invoiceId, ...safeData },
        })

        if (lineItems && lineItems.length > 0) {
          await tx.lineItem.deleteMany({ where: { invoiceId } })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await tx.lineItem.createMany({
            data: lineItems.map((item, idx) => ({
              invoiceId,
              sortOrder: idx,
              ...item,
            })) as any,
          })
        }

        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: 'EXTRACTED',
            ocrConfidence: confidence ? confidence : null,
          },
        })
      } else if (status === 'failed') {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: 'ERROR' },
        })
      }
    })

    return { ok: true }
  })
}
