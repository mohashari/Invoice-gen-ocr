import puppeteer from 'puppeteer'
import Handlebars from 'handlebars'
import { uploadFile, BUCKETS } from './storage.service'
import { prisma } from '../utils/db'
import fs from 'fs'
import path from 'path'

const TEMPLATE_PATH = path.join(__dirname, '../templates/invoice.html')

const FALLBACK_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
  h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .meta { color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { background: #3498db; color: white; padding: 10px; text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  .totals { text-align: right; margin-top: 20px; }
  .totals td { font-weight: bold; }
  .total-row { background: #f0f8ff; font-size: 1.1em; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>INVOICE</h1>
      <p class="meta">No: {{invoiceData.invoiceNumber}}</p>
    </div>
    <div class="meta" style="text-align:right">
      <p>Issue Date: {{invoiceData.issueDate}}</p>
      <p>Due Date: {{invoiceData.dueDate}}</p>
    </div>
  </div>

  <div style="margin-bottom:20px">
    <strong>Vendor:</strong><br/>
    {{invoiceData.vendorName}}<br/>
    {{invoiceData.vendorAddress}}
  </div>

  <table>
    <thead>
      <tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
    </thead>
    <tbody>
      {{#each lineItems}}
      <tr>
        <td>{{this.description}}</td>
        <td>{{this.quantity}}</td>
        <td>{{formatCurrency this.unitPrice ../invoiceData.currency}}</td>
        <td>{{formatCurrency this.total ../invoiceData.currency}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="totals">
    <table style="width:300px; margin-left:auto">
      <tr><td>Subtotal</td><td>{{formatCurrency invoiceData.subtotal invoiceData.currency}}</td></tr>
      <tr><td>Tax</td><td>{{formatCurrency invoiceData.taxAmount invoiceData.currency}}</td></tr>
      <tr class="total-row"><td>TOTAL</td><td>{{formatCurrency invoiceData.totalAmount invoiceData.currency}}</td></tr>
    </table>
  </div>

  {{#if invoiceData.paymentTerms}}
  <p style="margin-top:30px"><strong>Payment Terms:</strong> {{invoiceData.paymentTerms}}</p>
  {{/if}}
  {{#if invoiceData.notes}}
  <p><strong>Notes:</strong> {{invoiceData.notes}}</p>
  {{/if}}
</body>
</html>`

Handlebars.registerHelper('formatCurrency', (amount: number, currency: string) => {
  if (!amount) return '-'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: currency || 'IDR' }).format(amount)
})

export async function generatePdf(invoiceId: string): Promise<string> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { invoiceData: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
  })

  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`)

  const templateSrc = fs.existsSync(TEMPLATE_PATH)
    ? fs.readFileSync(TEMPLATE_PATH, 'utf8')
    : FALLBACK_TEMPLATE

  const template = Handlebars.compile(templateSrc)
  const html = template({
    invoiceData: invoice.invoiceData,
    lineItems: invoice.lineItems,
    invoice,
  })

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } })

    const key = `${invoiceId}/invoice.pdf`
    const pdfUrl = await uploadFile(BUCKETS.PDF, key, Buffer.from(pdfBuffer), 'application/pdf')

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { pdfUrl },
    })

    return pdfUrl
  } finally {
    await browser.close()
  }
}
