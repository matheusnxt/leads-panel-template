'use client'

import { Globe } from 'lucide-react'
import LeadsPage from '@/components/leads/LeadsPage'
import styles from './page.module.css'

export default function LeadsSitePage() {
  return (
    <LeadsPage
      source="site"
      emptyState={
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Globe size={28} strokeWidth={1.5} /></div>
          <h2 className={styles.emptyTitle}>Nenhum lead do site ainda</h2>
          <p className={styles.emptyText}>
            Os leads enviados pelo seu site aparecerão aqui em tempo real, separados dos leads do Meta Ads.
          </p>
          <div className={styles.emptyHint}>
            Envie os leads do site para <code>POST /api/leads/site</code>
          </div>
        </div>
      }
    />
  )
}
