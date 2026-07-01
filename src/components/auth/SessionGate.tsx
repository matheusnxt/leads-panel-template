'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from '@/contexts/SessionContext'
import { allowedPaths } from '@/lib/tabs'
import styles from './SessionGate.module.css'

// Redireciona para /login quando não há sessão e bloqueia rotas sem permissão.
// A proteção real dos dados é garantida pelo RLS do Supabase.
export default function SessionGate({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    if (!session) { router.replace('/login'); return }
    if (!profile) return

    const allowed = allowedPaths(profile.role, profile.permissions)

    // Eventos (e subrotas) exigem a permissão 'eventos'
    if (pathname.startsWith('/eventos')) {
      const ok = profile.role === 'adm' || (profile.permissions ?? []).includes('eventos')
      if (!ok) router.replace(allowed[0] ?? '/login')
      return
    }

    // /analytics é liberada conforme a permissão da origem (?source=)
    if (pathname === '/analytics') {
      const raw = new URLSearchParams(window.location.search).get('source')
      const src = raw === 'planilha' ? 'planilhas' : raw === 'site' ? 'site' : 'leads'
      const ok = profile.role === 'adm' || (profile.permissions ?? []).includes(src)
      if (!ok) router.replace(allowed[0] ?? '/login')
      return
    }

    if (!allowed.includes(pathname)) {
      router.replace(allowed[0] ?? '/login')
    }
  }, [loading, session, profile, pathname, router])

  if (loading || !session) {
    return <div className={styles.center}><div className={styles.spinner} /></div>
  }

  // Sem nenhuma aba liberada
  if (profile && allowedPaths(profile.role, profile.permissions).length === 0) {
    return (
      <div className={styles.center}>
        <div className={styles.noAccess}>
          <h2>Sem acesso</h2>
          <p>Seu usuário ainda não tem nenhuma aba liberada. Fale com um administrador.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
