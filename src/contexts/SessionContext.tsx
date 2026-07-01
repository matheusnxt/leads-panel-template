'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'
import type { Role } from '@/lib/auth'

type Profile = { username: string; name: string | null; role: Role; permissions: string[] | null }

type SessionContextType = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextType>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(s: Session | null) {
    if (!s) { setProfile(null); return }
    const { data } = await supabase
      .from('profiles')
      .select('username, name, role, permissions')
      .eq('id', s.user.id)
      .single()
    setProfile(data ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      await loadProfile(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    try { await logActivity('saiu da plataforma') } catch { /* segue */ }
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  return (
    <SessionContext.Provider value={{ session, profile, loading, signOut }}>
      {children}
    </SessionContext.Provider>
  )
}

export const useSession = () => useContext(SessionContext)
