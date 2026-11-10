'use client'

import { Radio } from 'lucide-react'
import LeadsPage from '@/components/leads/LeadsPage'
import styles from './page.module.css'

// Aba "Lives": idêntica à aba Leads (lista, kanban, filtros, score, exportação,
// tempo real e Analytics), mas só mostra leads com source = 'lives'.
//
// O emptyState existe porque, sem ele, uma lista vazia cairia na mensagem
// padrão da aba Leads, que fala de Meta Ads e de webhook do Meta.
export default function LivesPage() {
  return (
    <LeadsPage
      source="lives"
      emptyState={
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Radio size={28} strokeWidth={1.5} /></div>
          <h2 className={styles.emptyTitle}>Nenhum lead das lives ainda</h2>
          <p className={styles.emptyText}>
            Os cadastros feitos na página das lives aparecem aqui em tempo real,
            separados dos leads do Meta Ads, do site e das planilhas.
          </p>
          <div className={styles.emptyHint}>
            A página envia os cadastros para <code>POST /api/leads/lives</code>
          </div>
        </div>
      }
    />
  )
}
