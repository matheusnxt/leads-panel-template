'use client'

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import UploadPanel from '@/components/planilhas/UploadPanel'
import SpreadsheetManager from '@/components/planilhas/SpreadsheetManager'
import LeadsPage, { type LeadSource } from '@/components/leads/LeadsPage'
import { useSession } from '@/contexts/SessionContext'
import styles from './page.module.css'

// Aba única de planilhas. Antes eram duas abas quase idênticas — /planilhas e
// /leads-upload — que só diferiam na origem gravada em `leads.source`.
//
// As duas bases aparecem JUNTAS aqui, sem nada ter sido migrado: cada lead
// mantém a origem com que entrou, e a aba simplesmente consulta as duas. Isso
// preserva o histórico e permite desfazer a unificação sem perder informação.
const ORIGENS: LeadSource[] = ['planilha', 'upload']

// Importações novas entram como 'upload', que é o importador com paridade
// total com a aba Leads (coluna Data → created_at, Formulário → form_name).
const ORIGEM_NOVA = 'upload'

export default function PlanilhasPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const { profile } = useSession()
  const isAdmin = profile?.role === 'adm'
  const refresh = () => setRefreshKey(k => k + 1)

  return (
    <div>
      <UploadPanel onImported={refresh} source={ORIGEM_NOVA} mapExtras />
      <SpreadsheetManager
        refreshKey={refreshKey}
        onChanged={refresh}
        isAdmin={isAdmin}
        sources={ORIGENS}
      />
      <LeadsPage
        key={refreshKey}
        source="planilha"
        sources={ORIGENS}
        fillHeight={false}
        emptyState={
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><FileSpreadsheet size={26} strokeWidth={1.5} /></div>
            <h2 className={styles.emptyTitle}>Nenhuma planilha importada ainda</h2>
            <p className={styles.emptyText}>
              Envie um arquivo acima para começar a montar sua base de leads de planilhas.
            </p>
          </div>
        }
      />
    </div>
  )
}
