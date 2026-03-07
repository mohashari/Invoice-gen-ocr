import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Download, ExternalLink } from 'lucide-react'
import { invoiceApi } from '@/services/api'

export default function InvoicePreviewPage() {
  const { id } = useParams<{ id: string }>()

  const { data: invoice } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoiceApi.get(id!).then((r) => r.data),
    enabled: !!id,
  })

  const { data: pdfData, isLoading } = useQuery({
    queryKey: ['invoice-pdf', id],
    queryFn: () => invoiceApi.getPdfUrl(id!).then((r) => r.data),
    enabled: !!id && !!invoice?.pdfUrl,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={`/invoices/${id}/edit`} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronLeft size={18} />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">PDF Preview</h1>
        </div>
        {pdfData?.url && (
          <div className="flex gap-2">
            <a href={pdfData.url} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2">
              <ExternalLink size={16} /> Open in new tab
            </a>
            <a href={pdfData.url} download className="btn-primary flex items-center gap-2">
              <Download size={16} /> Download PDF
            </a>
          </div>
        )}
      </div>

      {isLoading && <div className="card h-96 animate-pulse" />}

      {!invoice?.pdfUrl && !isLoading && (
        <div className="card text-center text-gray-500 py-16">
          <p>No PDF generated yet.</p>
          <Link to={`/invoices/${id}/edit`} className="btn-primary inline-block mt-4">
            Go to Editor to Generate PDF
          </Link>
        </div>
      )}

      {pdfData?.url && (
        <div className="card p-0 overflow-hidden" style={{ height: '80vh' }}>
          <iframe
            src={pdfData.url}
            className="w-full h-full border-0"
            title="Invoice PDF Preview"
          />
        </div>
      )}
    </div>
  )
}
