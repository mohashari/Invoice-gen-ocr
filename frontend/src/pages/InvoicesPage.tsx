import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, Upload, Trash2, Edit, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { invoiceApi } from '@/services/api'
import StatusBadge from '@/components/invoice/StatusBadge'
import { format } from 'date-fns'
import type { InvoiceStatus } from '@/types'

const STATUSES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'EXTRACTED', label: 'Extracted' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'ERROR', label: 'Error' },
]

export default function InvoicesPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, status, search],
    queryFn: () => invoiceApi.list({ page, limit: 20, status: status || undefined, search: search || undefined }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this invoice?')) return
    try {
      await invoiceApi.delete(id)
      toast.success('Invoice deleted')
      qc.invalidateQueries({ queryKey: ['invoices'] })
    } catch {
      toast.error('Failed to delete')
    }
  }

  const totalPages = data ? Math.ceil(data.total / 20) : 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <Link to="/upload" className="btn-primary flex items-center gap-2">
          <Upload size={16} /> Upload New
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by vendor or invoice #..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1) } }}
          />
        </div>
        <select
          className="input w-40"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
        >
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice #</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">OCR %</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {[...Array(7)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : data?.invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  No invoices found. <Link to="/upload" className="text-blue-600 hover:underline">Upload one</Link>.
                </td>
              </tr>
            ) : (
              data?.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {inv.invoiceData?.invoiceNumber || inv.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {inv.invoiceData?.vendorName || <span className="text-gray-400 italic">Unrecognized</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {format(new Date(inv.createdAt), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status as InvoiceStatus} /></td>
                  <td className="px-4 py-3">
                    {inv.ocrConfidence != null ? (
                      <span className={`text-xs font-medium ${Number(inv.ocrConfidence) >= 80 ? 'text-green-600' : Number(inv.ocrConfidence) >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {Number(inv.ocrConfidence).toFixed(1)}%
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {inv.invoiceData?.totalAmount
                      ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: inv.invoiceData.currency || 'IDR' }).format(Number(inv.invoiceData.totalAmount))
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/invoices/${inv.id}/edit`} className="p-1.5 rounded hover:bg-gray-200 text-gray-500">
                        <Edit size={14} />
                      </Link>
                      {inv.pdfUrl && (
                        <Link to={`/invoices/${inv.id}/preview`} className="p-1.5 rounded hover:bg-gray-200 text-gray-500">
                          <Eye size={14} />
                        </Link>
                      )}
                      <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded hover:bg-red-100 text-gray-500 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total}
            </p>
            <div className="flex items-center gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary p-1.5 disabled:opacity-40">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-secondary p-1.5 disabled:opacity-40">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
