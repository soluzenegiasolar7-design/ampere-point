import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth.store'
import LoginPage from './pages/Login/LoginPage'
import PunchPage from './pages/Employee/PunchPage'
import MapPage from './pages/Manager/MapPage'

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { loadMe, token } = useAuthStore()

  useEffect(() => {
    if (token) loadMe()
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/ponto" element={<ProtectedRoute roles={['EMPLOYEE']}><PunchPage /></ProtectedRoute>} />
        <Route path="/gestor" element={<ProtectedRoute roles={['ADMIN', 'MANAGER']}><MapPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </HashRouter>
  )
}
