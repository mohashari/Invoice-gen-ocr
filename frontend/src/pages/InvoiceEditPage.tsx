import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Save, FileDown, ChevronLeft, AlertTriangle, Eye } from 'lucide-react'
import { invoiceApi } from '@/services/api'
import StatusBadge from '@/components/invoice/StatusBadge'
import LineItemsTable from '@/components/invoice/LineItemsTable'
import type { LineItem, InvoiceStatus } from '@/types'

export default function InvoiceEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoiceApi.get(id!).then((r) => r.data),
    enabled: !!id,
  })

  const [lineItems, setLineItems] = useState<Partial<LineItem>[]>([])
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  const { register, reset, handleSubmit, watch } = useForm({
    defaultValues: {
      invoiceNumber: '',
      vendorName: '',
      vendorAddress: '',
      issueDate: '',
      dueDate: '',
      currency: 'IDR',
      subtotal: '',
      taxAmount: '',
      totalAmount: '',
      paymentTerms: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (invoice) {
      const d = invoice.invoiceData
      reset({
        invoiceNumber: d?.invoiceNumber || '',
        vendorName: d?.vendorName || '',
        vendorAddress: d?.vendorAddress || '',
        issueDate: d?.issueDate ? d.issueDate.split('T')[0] : '',
        dueDate: d?.dueDate ? d.dueDate.split('T')[0] : '',
        currency: d?.currency || 'IDR',
        subtotal: d?.subtotal?.toString() || '',
        taxAmount: d?.taxAmount?.toString() || '',
        totalAmount: d?.totalAmount?.toString() || '',
        paymentTerms: d?.paymentTerms || '',
        notes: d?.notes || '',
      })
      setLineItems(invoice.lineItems || [])
    }
  }, [invoice, reset])

  const onSave = async (formData: Record<string, string>) => {
    setSaving(true)
    try {
      await invoiceApi.update(id!, {
        status: 'CONFIRMED',
        invoiceData: {
          ...formData,
          subtotal: formData.subtotal ? Number(formData.subtotal) : null,
          taxAmount: formData.taxAmount ? Number(formData.taxAmount) : null,
          totalAmount: formData.totalAmount ? Number(formData.totalAmount) : null,
        },
        lineItems: lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      })
      toast.success('Invoice saved and confirmed')
      qc.invalidateQueries({ queryKey: ['invoice', id] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    } catch {
      toast.error('Failed to save invoice')
    } finally {
      setSaving(false)
    }
  }

  const handleGeneratePdf = async () => {
    setGenerating(true)
    try {
      await invoiceApi.generatePdf(id!)
      toast.success('PDF generated successfully')
      qc.invalidateQueries({ queryKey: ['invoice', id] })
    } catch {
      toast.error('PDF generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const currency = watch('currency')
  const isLowConfidence = invoice && invoice.ocrConfidence != null && Number(invoice.ocrConfidence) < 70

  if (isLoading) {
    return <div className="card animate-pulse h-64" />
  }

  if (!invoice) {
    return <div className="card text-center text-gray-500">Invoice not found</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/invoices" className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {invoice.invoiceData?.vendorName || 'Invoice Editor'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={invoice.status as InvoiceStatus} />
              {invoice.ocrConfidence != null && (
                <span className={`text-xs font-medium ${Number(invoice.ocrConfidence) >= 80 ? 'text-green-600' : 'text-yellow-600'}`}>
                  OCR: {Number(invoice.ocrConfidence).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {invoice.pdfUrl && (
            <Link to={`/invoices/${id}/preview`} className="btn-secondary flex items-center gap-2">
              <Eye size={16} /> Preview PDF
            </Link>
          )}
          <button
            onClick={handleGeneratePdf}
            disabled={generating}
            className="btn-secondary flex items-center gap-2"
          >
            <FileDown size={16} /> {generating ? 'Generating...' : 'Generate PDF'}
          </button>
          <button
            onClick={handleSubmit(onSave as never)}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save & Confirm'}
          </button>
        </div>
      </div>

      {/* Low confidence warning */}
      {isLowConfidence && (
        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-yellow-800">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <p className="text-sm">
            OCR confidence is low ({Number(invoice.ocrConfidence).toFixed(1)}%). Please review all fields carefully before confirming.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSave as never)} className="space-y-6">
        {/* Invoice Details */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-700">Invoice Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Invoice Number">
              <input {...register('invoiceNumber')} className="input" placeholder="INV-001" />
            </Field>
            <Field label="Currency">
              <select {...register('currency')} className="input">
                <option value="IDR">IDR — Indonesian Rupiah</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </Field>
            <Field label="Issue Date">
              <input {...register('issueDate')} type="date" className="input" />
            </Field>
            <Field label="Due Date">
              <input {...register('dueDate')} type="date" className="input" />
            </Field>
          </div>
        </div>

        {/* Vendor */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-700">Vendor Information</h2>
          <Field label="Vendor Name">
            <input {...register('vendorName')} className="input" placeholder="PT. Example Corp" />
          </Field>
          <Field label="Vendor Address">
            <textarea {...register('vendorAddress')} className="input" rows={2} placeholder="Jl. Example No. 1, Jakarta" />
          </Field>
        </div>

        {/* Line Items */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-700">Line Items</h2>
          <LineItemsTable items={lineItems} onChange={setLineItems} currency={currency || 'IDR'} />
        </div>

        {/* Totals */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-700">Totals</h2>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Subtotal">
              <input {...register('subtotal')} type="number" step="0.01" className="input" />
            </Field>
            <Field label="Tax Amount">
              <input {...register('taxAmount')} type="number" step="0.01" className="input" />
            </Field>
            <Field label="Total Amount">
              <input {...register('totalAmount')} type="number" step="0.01" className="input" />
            </Field>
          </div>
        </div>

        {/* Notes */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-700">Additional Info</h2>
          <Field label="Payment Terms">
            <input {...register('paymentTerms')} className="input" placeholder="Net 30" />
          </Field>
          <Field label="Notes">
            <textarea {...register('notes')} className="input" rows={3} />
          </Field>
        </div>

        {/* Raw OCR text */}
        {invoice.invoiceData?.rawOcrText && (
          <details className="card">
            <summary className="cursor-pointer font-semibold text-gray-500 text-sm">Raw OCR Output</summary>
            <pre className="mt-3 text-xs text-gray-500 whitespace-pre-wrap font-mono bg-gray-50 p-3 rounded-lg max-h-64 overflow-auto">
              {invoice.invoiceData.rawOcrText}
            </pre>
          </details>
        )}
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
