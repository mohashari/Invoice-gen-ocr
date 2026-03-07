import { Plus, Trash2 } from 'lucide-react'
import type { LineItem } from '@/types'

interface Props {
  items: Partial<LineItem>[]
  onChange: (items: Partial<LineItem>[]) => void
  currency: string
  readOnly?: boolean
}

const fmt = (val: number | null | undefined, currency: string) => {
  if (!val) return '-'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency }).format(val)
}

export default function LineItemsTable({ items, onChange, currency, readOnly }: Props) {
  const addRow = () =>
    onChange([...items, { description: '', quantity: 1, unitPrice: 0, total: 0 }])

  const removeRow = (idx: number) => onChange(items.filter((_, i) => i !== idx))

  const update = (idx: number, field: string, value: string | number) => {
    const updated = items.map((item, i) => {
      if (i !== idx) return item
      const next = { ...item, [field]: value }
      if (field === 'quantity' || field === 'unitPrice') {
        next.total = Number(next.quantity || 0) * Number(next.unitPrice || 0)
      }
      return next
    })
    onChange(updated)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 pr-4 font-medium text-gray-600">Description</th>
            <th className="text-right py-2 px-2 font-medium text-gray-600 w-20">Qty</th>
            <th className="text-right py-2 px-2 font-medium text-gray-600 w-32">Unit Price</th>
            <th className="text-right py-2 pl-2 font-medium text-gray-600 w-32">Total</th>
            {!readOnly && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-100">
              <td className="py-2 pr-4">
                {readOnly ? item.description : (
                  <input
                    className="input"
                    value={item.description || ''}
                    onChange={(e) => update(idx, 'description', e.target.value)}
                  />
                )}
              </td>
              <td className="py-2 px-2">
                {readOnly ? (
                  <span className="text-right block">{item.quantity}</span>
                ) : (
                  <input
                    type="number"
                    className="input text-right"
                    value={item.quantity || ''}
                    onChange={(e) => update(idx, 'quantity', Number(e.target.value))}
                  />
                )}
              </td>
              <td className="py-2 px-2">
                {readOnly ? (
                  <span className="text-right block">{fmt(item.unitPrice, currency)}</span>
                ) : (
                  <input
                    type="number"
                    className="input text-right"
                    value={item.unitPrice || ''}
                    onChange={(e) => update(idx, 'unitPrice', Number(e.target.value))}
                  />
                )}
              </td>
              <td className="py-2 pl-2 text-right">{fmt(item.total, currency)}</td>
              {!readOnly && (
                <td className="py-2 pl-2">
                  <button onClick={() => removeRow(idx)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button onClick={addRow} className="mt-3 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
          <Plus size={14} /> Add line item
        </button>
      )}
    </div>
  )
}
