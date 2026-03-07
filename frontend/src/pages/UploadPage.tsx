import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import DropZone from '@/components/upload/DropZone'
import { invoiceApi } from '@/services/api'

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export default function UploadPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<UploadState>('idle')
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [progress, setProgress] = useState('')

  const handleFile = async (file: File) => {
    setState('uploading')
    setProgress('Uploading file...')

    try {
      const { data: invoice } = await invoiceApi.upload(file)
      setInvoiceId(invoice.id)
      setState('processing')
      setProgress('File uploaded. OCR processing in progress...')

      const source = invoiceApi.statusStream(invoice.id)

      source.onmessage = (e) => {
        const payload = JSON.parse(e.data)
        if (payload.status === 'EXTRACTED') {
          setState('done')
          setProgress('OCR complete! Redirecting to editor...')
          source.close()
          setTimeout(() => navigate(`/invoices/${invoice.id}/edit`), 1500)
        } else if (payload.status === 'ERROR') {
          setState('error')
          setProgress('OCR failed. You can still edit manually.')
          source.close()
        } else if (payload.status === 'PROCESSING') {
          setProgress('Tesseract 5 is reading your invoice...')
        }
      }

      source.onerror = () => {
        source.close()
        if (state !== 'done' && state !== 'error') {
          setState('done')
          setProgress('Processing complete.')
          setTimeout(() => navigate(`/invoices/${invoice.id}/edit`), 1500)
        }
      }
    } catch (err: unknown) {
      setState('error')
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Upload failed'
      setProgress(msg)
      toast.error(msg)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload Invoice</h1>
        <p className="text-gray-500 text-sm mt-1">Upload a scanned invoice to extract data automatically with Tesseract 5 OCR.</p>
      </div>

      {state === 'idle' && <DropZone onFile={handleFile} />}

      {state !== 'idle' && (
        <div className="card text-center space-y-4">
          {state === 'uploading' || state === 'processing' ? (
            <Loader2 size={40} className="mx-auto text-blue-500 animate-spin" />
          ) : state === 'done' ? (
            <CheckCircle size={40} className="mx-auto text-green-500" />
          ) : (
            <AlertCircle size={40} className="mx-auto text-red-500" />
          )}

          <p className="font-medium text-gray-700">{progress}</p>

          {state === 'error' && invoiceId && (
            <button className="btn-primary" onClick={() => navigate(`/invoices/${invoiceId}/edit`)}>
              Edit Manually
            </button>
          )}

          {state === 'error' && (
            <button className="btn-secondary" onClick={() => setState('idle')}>
              Try Again
            </button>
          )}
        </div>
      )}

      <div className="card bg-blue-50 border-blue-100">
        <h3 className="font-semibold text-blue-800 mb-2">How it works</h3>
        <ol className="space-y-1 text-sm text-blue-700 list-decimal list-inside">
          <li>Upload PNG, JPG, TIFF, or PDF invoice (max 20MB)</li>
          <li>Image is preprocessed (deskew, denoise, contrast enhancement)</li>
          <li>Tesseract 5 LSTM engine extracts text with eng+ind language packs</li>
          <li>Regex + NLP parser identifies invoice fields and line items</li>
          <li>Review and correct extracted data, then generate PDF</li>
        </ol>
      </div>
    </div>
  )
}
