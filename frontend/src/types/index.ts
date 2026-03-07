export type Role = 'ADMIN' | 'ACCOUNTANT' | 'VIEWER'
export type InvoiceStatus = 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'CONFIRMED' | 'ERROR'

export interface User {
  id: string
  email: string
  role: Role
  createdAt: string
}

export interface InvoiceData {
  id: string
  invoiceId: string
  invoiceNumber: string | null
  vendorName: string | null
  vendorAddress: string | null
  issueDate: string | null
  dueDate: string | null
  currency: string
  subtotal: number | null
  taxAmount: number | null
  totalAmount: number | null
  paymentTerms: string | null
  notes: string | null
  rawOcrText: string | null
  isCorrected: boolean
}

export interface LineItem {
  id: string
  invoiceId: string
  description: string | null
  quantity: number | null
  unitPrice: number | null
  total: number | null
  sortOrder: number
}

export interface OcrJob {
  id: string
  invoiceId: string
  queueJobId: string | null
  status: 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED'
  errorMsg: string | null
  startedAt: string | null
  finishedAt: string | null
}

export interface Invoice {
  id: string
  userId: string
  status: InvoiceStatus
  rawFileUrl: string | null
  pdfUrl: string | null
  ocrConfidence: number | null
  createdAt: string
  updatedAt: string
  invoiceData?: InvoiceData | null
  lineItems?: LineItem[]
  ocrJob?: OcrJob | null
}

export interface PaginatedInvoices {
  total: number
  page: number
  limit: number
  invoices: Invoice[]
}
