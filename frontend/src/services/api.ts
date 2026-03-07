import axios from 'axios'
import { useAuthStore } from '@/stores/auth.store'
import type { Invoice, PaginatedInvoices, User } from '@/types'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true
      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true })
        useAuthStore.getState().setAccessToken(data.accessToken)
        error.config.headers.Authorization = `Bearer ${data.accessToken}`
        return api(error.config)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ accessToken: string; user: User }>('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<User>('/users/me'),
}

export const invoiceApi = {
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<Invoice>('/invoices/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  list: (params?: { page?: number; limit?: number; status?: string; search?: string }) =>
    api.get<PaginatedInvoices>('/invoices', { params }),

  get: (id: string) => api.get<Invoice>(`/invoices/${id}`),

  update: (id: string, data: Record<string, unknown>) =>
    api.put<Invoice>(`/invoices/${id}`, data),

  delete: (id: string) => api.delete(`/invoices/${id}`),

  generatePdf: (id: string) => api.post<{ pdfUrl: string }>(`/invoices/${id}/generate-pdf`),

  getPdfUrl: (id: string) => api.get<{ url: string }>(`/invoices/${id}/pdf`),

  statusStream: (id: string) => new EventSource(`/api/invoices/${id}/status`),
}

export const userApi = {
  list: () => api.get<User[]>('/users'),
}

export default api
