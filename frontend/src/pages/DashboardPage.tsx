import { useQuery } from '@tanstack/react-query'
import { FileText, CheckCircle, AlertCircle, Clock, TrendingUp } from 'lucide-react'
import { invoiceApi } from '@/services/api'
import { Link } from 'react-router-dom'
import StatusBadge from '@/components/invoice/StatusBadge'
import { format } from 'date-fns'
import type { InvoiceStatus } from '@/types'

const STATUS_COUNTS: InvoiceStatus[] = ['PENDING', 'PROCESSING', 'EXTRACTED', 'CONFIRMED', 'ERROR']

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', 'all'],
    queryFn: () => invoiceApi.list({ limit: 100 }).then((r) => r.data),
  })

  const invoices = data?.invoices ?? []
  const statusMap = STATUS_COUNTS.reduce((acc, s) => {
    acc[s] = invoices.filter((i) => i.status === s).length
    return acc
  }, {} as Record<string, number>)

  const totalAmount = invoices
    .filter((i) => i.status === 'CONFIRMED')
    .reduce((sum, i) => sum + Number(i.invoiceData?.totalAmount || 0), 0)

  const recentInvoices = [...invoices].slice(0, 5)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<FileText className="text-blue-500" />} label="Total Invoices" value={data?.total ?? 0} color="blue" />
        <StatCard icon={<CheckCircle className="text-green-500" />} label="Confirmed" value={statusMap.CONFIRMED ?? 0} color="green" />
        <StatCard icon={<Clock className="text-yellow-500" />} label="Pending Review" value={statusMap.EXTRACTED ?? 0} color="yellow" />
        <StatCard icon={<AlertCircle className="text-red-500" />} label="Errors" value={statusMap.ERROR ?? 0} color="red" />
      </div>

      {/* Total Amount */}
      <div className="card flex items-center gap-4">
        <div className="p-3 bg-green-100 rounded-xl">
          <TrendingUp size={24} className="text-green-600" />
        </div>
        <div>
          <p className="text-sm text-gray-500">Total Confirmed Amount</p>
          <p className="text-2xl font-bold text-gray-900">
            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(totalAmount)}
          </p>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4">Status Breakdown</h2>
        <div className="space-y-2">
          {STATUS_COUNTS.map((s) => (
            <div key={s} className="flex items-center gap-3">
              <StatusBadge status={s} />
              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-blue-500 rounded-full"
                  style={{ width: `${data?.total ? ((statusMap[s] ?? 0) / data.total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-sm text-gray-600 w-8 text-right">{statusMap[s] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent invoices */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700">Recent Invoices</h2>
          <Link to="/invoices" className="text-sm text-blue-600 hover:underline">View all</Link>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : recentInvoices.length === 0 ? (
          <p className="text-gray-400 text-sm">No invoices yet. <Link to="/upload" className="text-blue-600 hover:underline">Upload one</Link>.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-gray-500 font-medium">Vendor</th>
                <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                <th className="text-right py-2 text-gray-500 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {recentInvoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2">
                    <Link to={`/invoices/${inv.id}/edit`} className="text-blue-600 hover:underline font-medium">
                      {inv.invoiceData?.vendorName || 'Unknown vendor'}
                    </Link>
                  </td>
                  <td className="py-2 text-gray-500">
                    {format(new Date(inv.createdAt), 'dd MMM yyyy')}
                  </td>
                  <td className="py-2"><StatusBadge status={inv.status} /></td>
                  <td className="py-2 text-right text-gray-700">
                    {inv.invoiceData?.totalAmount
                      ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: inv.invoiceData.currency || 'IDR' }).format(Number(inv.invoiceData.totalAmount))
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const bg: Record<string, string> = {
    blue: 'bg-blue-50', green: 'bg-green-50', yellow: 'bg-yellow-50', red: 'bg-red-50',
  }
  return (
    <div className={`card flex items-center gap-3 ${bg[color]}`}>
      <div className="p-2 bg-white rounded-lg shadow-sm">{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}
