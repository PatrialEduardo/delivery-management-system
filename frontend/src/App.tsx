import { AuthProvider, useAuth } from './context/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'

function Gate() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <HomePage /> : <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
