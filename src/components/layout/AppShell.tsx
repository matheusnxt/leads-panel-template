'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ViewProvider } from '@/contexts/ViewContext'
import { SessionProvider } from '@/contexts/SessionContext'
import SessionGate from '@/components/auth/SessionGate'
import Sidebar from './Sidebar'
import Header from './Header'
import styles from './AppShell.module.css'

type Props = { children: React.ReactNode }

export default function AppShell({ children }: Props) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  // A página de login fica fora do shell (sem sidebar/header e sem gate).
  if (pathname === '/login') {
    return <SessionProvider>{children}</SessionProvider>
  }

  return (
    <SessionProvider>
      <SessionGate>
        <ViewProvider>
          <div className={styles.shell}>
            <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
            {menuOpen && <div className={styles.backdrop} onClick={() => setMenuOpen(false)} />}
            <div className={styles.main}>
              <Header onMenu={() => setMenuOpen(true)} />
              <main className={styles.content}>{children}</main>
            </div>
          </div>
        </ViewProvider>
      </SessionGate>
    </SessionProvider>
  )
}
