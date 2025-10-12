import React, { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../utils/supabase'

type User = any

type ProfileContextValue = {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined)

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let mounted = true

    // Check initial auth state (Supabase v2)
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        setUser(data.session?.user ?? null)
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) {
        router.push('/login')
      }
    })

    return () => {
      mounted = false
      try {
        // Supabase returns { subscription } in data for v2
        if (listener && (listener as any).subscription && typeof (listener as any).subscription.unsubscribe === 'function') {
          ;(listener as any).subscription.unsubscribe()
        }
      } catch (e) {
        // ignore
      }
    }
  }, [router])

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.error('Error signing out', e)
    }
  }

  return (
    <ProfileContext.Provider value={{ user, loading, signOut }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
