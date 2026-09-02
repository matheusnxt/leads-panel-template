'use client'

import { useEffect, useState } from 'react'
import { X, History } from 'lucide-react'
import {
  fetchLeadActivity, describeActivity, formatActivityDate, type LeadActivity,
} from '@/lib/leadActivity'
import styles from './LeadTimelineDrawer.module.css'

type Props = {
  leadId: string
  leadName: string
  onClose: () => void
}

export default function LeadTimelineDrawer({ leadId, leadName, onClose }: Props) {
  const [items, setItems] = useState<LeadActivity[] | null>(null)

  useEffect(() => {
    let cancel = false
    fetchLeadActivity(leadId).then(data => { if (!cancel) setItems(data) })
    return () => { cancel = true }
  }, [leadId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <aside className={styles.drawer} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <History size={16} />
            <div>
              <div className={styles.title}>Histórico</div>
              <div className={styles.subtitle}>{leadName}</div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          {items === null ? (
            <div className={styles.loading}><div className={styles.spinner} /></div>
          ) : items.length === 0 ? (
            <div className={styles.empty}>Nenhuma atividade registrada ainda.</div>
          ) : (
            <ol className={styles.timeline}>
              {items.map(a => (
                <li key={a.id} className={styles.item}>
                  <span className={styles.dot} />
                  <div className={styles.itemContent}>
                    <div className={styles.itemAction}>
                      <strong>{a.user_name || 'Sistema'}</strong> {describeActivity(a)}
                    </div>
                    <div className={styles.itemDate}>{formatActivityDate(a.created_at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  )
}
