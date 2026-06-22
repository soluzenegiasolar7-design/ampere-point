import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002'

export const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ap_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ap_token')
      window.location.href = '/ampere-point/#/login'
    }
    return Promise.reject(err)
  }
)

export function photoUrl(path: string): string {
  const token = localStorage.getItem('ap_token')
  return `${import.meta.env.VITE_API_URL || 'http://localhost:3002'}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`
}
