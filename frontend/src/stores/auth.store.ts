import { create } from 'zustand'
import { api } from '../services/api'

interface User {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
  unit?: string
}

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loadMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('ap_token'),
  loading: false,

  login: async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('ap_token', data.token)
    set({ token: data.token, user: data.user })
  },

  logout: () => {
    localStorage.removeItem('ap_token')
    set({ token: null, user: null })
  },

  loadMe: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/api/auth/me')
      set({ user: data })
    } finally {
      set({ loading: false })
    }
  },
}))
