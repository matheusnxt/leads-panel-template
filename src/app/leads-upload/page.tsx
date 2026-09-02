'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import UploadPanel from '@/components/planilhas/UploadPanel'
import SpreadsheetManager from '@/components/planilhas/SpreadsheetManager'
import LeadsPage from '@/components/leads/LeadsPage'
import { useSession } from '@/contexts/SessionContext'
import styles from '../planilhas/page.module.css'

// Aba "Leads - Upload": mesma UI/filtros/scoring da aba Leads, porém alimentada
// exclusivamente por upload manual de planilha (source='upload'). Totalmente
// independente da integração Meta Ads (source='meta') e da aba Planilhas
// (source='planilha'). mapExtras=true dá paridade total com a aba Leads:
// coluna Data -> created_at e coluna Formulário -> form_name.
export default function LeadsUploadPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const { profile } = useSession()
  const isAdmin = profile?.role === 'adm'
  const refresh = () => setRefreshKey(k => k + 1)

  return (
    <div>
      <UploadPanel onImported={refresh} source="upload" mapExtras />
      <SpreadsheetManager refreshKey={refreshKey} onChanged={refresh} isAdmin={isAdmin} source="upload" />
      <LeadsPage
        key={refreshKey}
        source="upload"
        fillHeight={false}
        emptyState={
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><Upload size={26} strokeWidth={1.5} /></div>
            <h2 className={styles.emptyTitle}>Nenhum lead importado ainda</h2>
            <p className={styles.emptyText}>
              Envie sua planilha acima para popular esta aba. Os leads aqui vêm só do upload — nada da integração Meta Ads.
            </p>
          </div>
        }
      />
    </div>
  )
}
