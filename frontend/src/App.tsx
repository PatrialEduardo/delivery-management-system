import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { api } from './lib/api'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { DriverShippingsPage } from './pages/driver/DriverShippingsPage'
import { DriverShippingPage } from './pages/driver/DriverShippingPage'
import { DriverStopPage } from './pages/driver/DriverStopPage'

const BOOT_KEY = 'dms_boot_redirect_done'

function AuthedApp() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isDriver = user?.role === 'Driver'
  const booted = useRef(false)

  // Once per page load (reopening the tab / logging back in), a driver
  // with a delivery still in progress is dropped straight onto it.
  useEffect(() => {
    if (!isDriver || booted.current) return
    booted.current = true
    if (sessionStorage.getItem(BOOT_KEY)) return
    sessionStorage.setItem(BOOT_KEY, '1')
    api
      .activeDelivery()
      .then((a) => {
        if (a) {
          navigate(`/d/shipping/${a.shippingId}/stop/${a.deliveryId}`, { replace: true })
        }
      })
      .catch(() => {})
  }, [isDriver, navigate])

  if (isDriver) {
    return (
      <Routes>
        <Route path="/d" element={<DriverShippingsPage />} />
        <Route path="/d/shipping/:shippingId" element={<DriverShippingPage />} />
        <Route path="/d/shipping/:shippingId/stop/:deliveryId" element={<DriverStopPage />} />
        <Route path="*" element={<Navigate to="/d" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <AuthedApp /> : <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
