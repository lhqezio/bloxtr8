import React, { createContext, useContext, useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'

interface AuthState {
  isAuthenticated: boolean
  user: any | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // restore session on load
  useEffect(() => {
    async function restore() {
        try {
        const { data: session } = await authClient.getSession()
        if (session?.user) {
            setUser(session.user)
            setIsAuthenticated(true)
        }
        } finally {
        setIsLoading(false)
        }
    }
    restore()
    }, [])

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  const login = async (email: string, password: string) => {
    const { data, error } = await authClient.signIn.email({ email, password })
    if(data){
        setUser(data.user)
        setIsAuthenticated(true)
    }
    if (error) {
      throw error
    }
  }

  const logout = async () => {
    await authClient.signOut()
    setUser(null)
    setIsAuthenticated(false)
    window.location.reload()
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context ===undefined) {throw new Error("useAuth must be used within an AuthProvider")}
  return context
}