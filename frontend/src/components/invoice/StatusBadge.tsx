import type { InvoiceStatus } from '@/types'
import clsx from 'clsx'

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; cls: string }> = {
  PENDING:    { label: 'Pending',    cls: 'bg-gray-100 text-gray-600' },
  PROCESSING: { label: 'Processing', cls: 'bg-yellow-100 text-yellow-700 animate-pulse' },
  EXTRACTED:  { label: 'Extracted',  cls: 'bg-blue-100 text-blue-700' },
  CONFIRMED:  { label: 'Confirmed',  cls: 'bg-green-100 text-green-700' },
  ERROR:      { label: 'Error',      cls: 'bg-red-100 text-red-700' },
}

export default function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  )
}
