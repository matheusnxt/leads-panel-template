'use client'

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import UploadPanel from '@/components/planilhas/UploadPanel'
import SpreadsheetManager from '@/components/planilhas/SpreadsheetManager'
import LeadsPage from '@/components/leads/LeadsPage'
import { useSession } from '@/contexts/SessionContext'
import styles from './page.module.css'

export default function PlanilhasPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const { profile } = useSession()
  const isAdmin = profile?.role === 'adm'
  const refresh = () => setRefreshKey(k => k + 1)

  return (
    <div>
      <UploadPanel onImported={refresh} />
      <SpreadsheetManager refreshKey={refreshKey} onChanged={refresh} isAdmin={isAdmin} />
      <LeadsPage
        key={refreshKey}
        source="planilha"
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
