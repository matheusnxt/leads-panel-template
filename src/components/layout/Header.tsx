'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Search, LayoutList, Columns3, Menu, Sun, Moon, RefreshCw } from 'lucide-react'
import { useView } from '@/contexts/ViewContext'
import { useTheme } from '@/contexts/ThemeContext'
import styles from './Header.module.css'

const TITLES: Record<string, { title: string; badge: string }> = {
  '/': { title: 'Leads', badge: 'Meta Ads' },
  '/leads-site': { title: 'Leads Site', badge: 'Site' },
  '/planilhas': { title: 'Planilhas', badge: 'Planilhas' },
  '/usuarios': { title: 'Usuários', badge: 'Acesso' },
  '/analytics': { title: 'Analytics', badge: 'Métricas' },
  '/ads': { title: 'Meta Ads', badge: 'Anúncios' },
  '/funil': { title: 'Funil', badge: 'HubSpot' },
  '/atividades': { title: 'Atividades', badge: 'Log' },
}

export default function Header({ onMenu }: { onMenu?: () => void }) {
  const { view, setView, search, setSearch } = useView()
  const { theme, toggleTheme } = useTheme()
  const [refreshing, setRefreshing] = useState(false)
  const pathname = usePathname()
  const meta = TITLES[pathname] ?? TITLES['/']
  const showLeadControls = pathname === '/' || pathname === '/leads-site' || pathname === '/planilhas'

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button className={styles.menuBtn} onClick={onMenu} aria-label="Abrir menu">
          <Menu size={20} />
        </button>
        <h1 className={styles.title}>{meta.title}</h1>
        <span className={styles.badge}>{meta.badge}</span>
      </div>

      <div className={styles.right}>
        {showLeadControls && (
          <>
            <div className={styles.search}>
              <Search size={15} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Buscar lead..."
                className={styles.searchInput}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`}
                onClick={() => setView('list')}
                title="Visualização em Lista"
              >
                <LayoutList size={16} strokeWidth={1.75} />
              </button>
              <button
                className={`${styles.viewBtn} ${view === 'kanban' ? styles.viewBtnActive : ''}`}
                onClick={() => setView('kanban')}
                title="Visualização em Kanban"
              >
                <Columns3 size={16} strokeWidth={1.75} />
              </button>
            </div>
          </>
        )}

        {showLeadControls && (
          <button
            className={styles.themeBtn}
            onClick={() => {
              setRefreshing(true)
              window.location.reload()
            }}
            title="Atualizar página"
            aria-label="Atualizar página"
          >
            <RefreshCw
              size={17}
              strokeWidth={1.75}
              className={refreshing ? styles.spinning : undefined}
            />
          </button>
        )}

        <button
          className={styles.themeBtn}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? <Sun size={17} strokeWidth={1.75} /> : <Moon size={17} strokeWidth={1.75} />}
        </button>
      </div>
    </header>
  )
}
