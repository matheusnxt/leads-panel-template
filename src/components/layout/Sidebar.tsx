'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Users, FileSpreadsheet, UserCog, LogOut, Globe, Megaphone, Filter } from 'lucide-react'
import { useSession } from '@/contexts/SessionContext'
import { APP_NAME } from '@/lib/brand'
import { allowedPaths } from '@/lib/tabs'
import styles from './Sidebar.module.css'

const navItems = [
  { icon: Users, label: 'Leads', href: '/' },
  { icon: Globe, label: 'Leads Site', href: '/leads-site' },
  { icon: FileSpreadsheet, label: 'Planilhas', href: '/planilhas' },
  { icon: Megaphone, label: 'Meta Ads', href: '/ads' },
  { icon: Filter, label: 'Funil', href: '/funil' },
]

export default function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const { profile, signOut } = useSession()

  const initial = (profile?.name || profile?.username || '?').charAt(0).toUpperCase()
  const allowed = profile ? allowedPaths(profile.role, profile.permissions) : []
  const visibleNav = navItems.filter(i => allowed.includes(i.href))

  return (
    <aside className={`${styles.sidebar} ${open ? styles.open : ''}`}>
      <div className={styles.logo}>
        <Image
          src="/logo-healthgo-branco.png"
          alt={APP_NAME}
          width={1200}
          height={235}
          priority
          className={styles.logoImg}
        />
      </div>

      <nav className={styles.nav}>
        {visibleNav.map(({ icon: Icon, label, href }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{label}</span>
            </Link>
          )
        })}

        {profile?.role === 'adm' && (
          <Link
            href="/usuarios"
            onClick={onClose}
            className={`${styles.navItem} ${pathname === '/usuarios' ? styles.active : ''}`}
          >
            <UserCog size={18} strokeWidth={1.75} />
            <span>Usuários</span>
          </Link>
        )}
      </nav>

      <div className={styles.account}>
        <div className={styles.user}>
          <div className={styles.avatar}>{initial}</div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{profile?.name || profile?.username || '—'}</div>
            <div className={styles.userRole}>{profile?.role === 'adm' ? 'Administrador' : 'Usuário'}</div>
          </div>
        </div>
        <button className={styles.logout} onClick={signOut} title="Sair">
          <LogOut size={16} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  )
}
