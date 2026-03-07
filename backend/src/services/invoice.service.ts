import { prisma } from '../utils/db'
import { ocrQueue } from '../utils/queue'
import { uploadFile, BUCKETS, getPresignedUrl, parseS3Path } from './storage.service'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'

export async function uploadAndEnqueue(
  userId: string,
  fileBuffer: Buffer,
  originalFilename: string,
  mimeType: string,
) {
  const invoiceId = uuidv4()
  const ext = path.extname(originalFilename) || '.bin'
  const key = `${invoiceId}/original${ext}`

  const rawFileUrl = await uploadFile(BUCKETS.RAW, key, fileBuffer, mimeType)

  const invoice = await prisma.invoice.create({
    data: {
      id: invoiceId,
      userId,
      status: 'PENDING',
      rawFileUrl,
    },
  })

  const job = await ocrQueue.add('process', {
    invoiceId,
    rawFileUrl,
    mimeType,
  })

  await prisma.ocrJob.create({
    data: {
      invoiceId,
      queueJobId: job.id,
      status: 'QUEUED',
    },
  })

  return invoice
}

export async function listInvoices(
  userId: string,
  role: string,
  page = 1,
  limit = 20,
  status?: string,
  search?: string,
) {
  const where: Record<string, unknown> = role === 'ADMIN' ? {} : { userId }
  if (status) where.status = status
  if (search) {
    where.invoiceData = {
      OR: [
        { vendorName: { contains: search, mode: 'insensitive' } },
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
      ],
    }
  }

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: { invoiceData: true, ocrJob: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return { total, page, limit, invoices }
}

export async function getInvoiceById(id: string, userId: string, role: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { invoiceData: true, lineItems: { orderBy: { sortOrder: 'asc' } }, ocrJob: true },
  })

  if (!invoice) return null
  if (role !== 'ADMIN' && invoice.userId !== userId) return null

  return invoice
}

export async function updateInvoice(
  id: string,
  userId: string,
  role: string,
  data: {
    invoiceData?: Record<string, unknown>
    lineItems?: Array<Record<string, unknown>>
    status?: string
  },
) {
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) return null
  if (role !== 'ADMIN' && invoice.userId !== userId) return null

  return prisma.$transaction(async (tx) => {
    if (data.invoiceData) {
      await tx.invoiceData.upsert({
        where: { invoiceId: id },
        update: { ...data.invoiceData, isCorrected: true },
        create: { invoiceId: id, ...data.invoiceData },
      })
    }

    if (data.lineItems) {
      await tx.lineItem.deleteMany({ where: { invoiceId: id } })
      await tx.lineItem.createMany({
        data: data.lineItems.map((item, idx) => ({
          invoiceId: id,
          sortOrder: idx,
          ...item,
        })),
      })
    }

    return tx.invoice.update({
      where: { id },
      data: { status: (data.status as never) || invoice.status, updatedAt: new Date() },
      include: { invoiceData: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
    })
  })
}

export async function deleteInvoice(id: string, userId: string, role: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) return false
  if (role !== 'ADMIN' && invoice.userId !== userId) return false
  await prisma.invoice.delete({ where: { id } })
  return true
}

export async function getInvoicePdfUrl(id: string, userId: string, role: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice || !invoice.pdfUrl) return null
  if (role !== 'ADMIN' && invoice.userId !== userId) return null
  const { bucket, key } = parseS3Path(invoice.pdfUrl)
  return getPresignedUrl(bucket, key, 3600)
}
