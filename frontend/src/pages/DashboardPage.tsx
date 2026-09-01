import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export function DashboardPage() {
  const { user, logout } = useAuth()
  const [serverCheck, setServerCheck] = useState<string>('Checking token with the API…')

  useEffect(() => {
    api
      .me()
      .then((res) => setServerCheck(`API confirmed companyId ${res.companyId} for this token.`))
      .catch(() => setServerCheck('Token check failed — see console.'))
  }, [])

  return (
    <div style={{ padding: '3rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Signed in as {user?.fullName}</h1>
      <p>{serverCheck}</p>
      <button onClick={logout}>Log out</button>
    </div>
  )
}
