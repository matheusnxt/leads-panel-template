'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { getDownloadUrl, type ActivityLog } from '@/lib/activity'
import styles from './page.module.css'

export default function AtividadesPage() {
  const { profile, loading: sessLoading } = useSession()
  const router = useRouter()
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessLoading && profile && profile.role !== 'adm') router.replace('/')
  }, [sessLoading, profile, router])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000)
      if (!cancel) { setLogs(data ?? []); setLoading(false) }
    })()
    return () => { cancel = true }
  }, [])

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })

  if (sessLoading || (profile && profile.role !== 'adm')) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <Link href="/usuarios" className={styles.back}><ArrowLeft size={16} /> Voltar</Link>
        <div>
          <h1 className={styles.title}>Log de atividades</h1>
          <p className={styles.subtitle}>{logs.length} ações registradas</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : logs.length === 0 ? (
        <div className={styles.empty}>
          <Activity size={26} /> Nenhuma atividade registrada ainda.
        </div>
      ) : (
        <div className={styles.list}>
          {logs.map(l => (
            <div key={l.id} className={styles.row}>
              <div className={styles.dot} />
              <div className={styles.rowMain}>
                <div className={styles.action}>
                  <strong>{l.actor_name || 'Usuário'}</strong> {l.action}
                  {l.link && (
                    <button
                      className={styles.dl}
                      onClick={async () => {
                        const url = await getDownloadUrl(l.link!)
                        if (url) window.open(url, '_blank', 'noopener')
                        else alert('Não foi possível gerar o link de download.')
                      }}
                    >
                      <Download size={13} /> baixar
                    </button>
                  )}
                </div>
                <div className={styles.time}>{fmt(l.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
