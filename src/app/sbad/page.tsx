'use client'

import { ClipboardList } from 'lucide-react'
import LeadsPage from '@/components/leads/LeadsPage'
import styles from './page.module.css'

// Aba "SBAD": idêntica à aba Leads (lista, kanban, filtros, score, exportação,
// tempo real e Analytics), mas só mostra leads com source = 'sbad', vindos do
// pré-cadastro da página /sbad2026.
//
// O emptyState existe porque, sem ele, uma lista vazia cairia na mensagem
// padrão da aba Leads, que fala de Meta Ads e de webhook do Meta.
export default function SbadPage() {
  return (
    <LeadsPage
      source="sbad"
      emptyState={
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><ClipboardList size={28} strokeWidth={1.5} /></div>
          <h2 className={styles.emptyTitle}>Nenhum lead do SBAD ainda</h2>
          <p className={styles.emptyText}>
            Os pré-cadastros feitos na página do SBAD aparecem aqui em tempo real,
            separados dos leads do Meta Ads, do site, das lives e das planilhas.
          </p>
          <div className={styles.emptyHint}>
            A página envia os cadastros para <code>POST /api/leads/sbad</code>
          </div>
        </div>
      }
    />
  )
}
