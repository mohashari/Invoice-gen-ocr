import { Link, NavLink, useNavigate } from 'react-router-dom'
import { FileText, Upload, LayoutDashboard, LogOut, List } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { authApi } from '@/services/api'

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try { await authApi.logout() } catch {}
    logout()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-14">
        <Link to="/dashboard" className="flex items-center gap-2 font-bold text-blue-700">
          <FileText size={20} />
          InvoiceOCR
        </Link>

        <div className="flex items-center gap-1">
          <NavLink to="/dashboard" className={linkClass}>
            <LayoutDashboard size={16} /> Dashboard
          </NavLink>
          <NavLink to="/invoices" className={linkClass}>
            <List size={16} /> Invoices
          </NavLink>
          <NavLink to="/upload" className={linkClass}>
            <Upload size={16} /> Upload
          </NavLink>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            {user?.role}
          </span>
          <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  )
}
