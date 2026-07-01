'use client'

import { useEffect, useState } from 'react'
import { FileSpreadsheet, X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { guessMapping, rowsToLeads, type SheetRow } from '@/lib/sheets'
import { logActivity } from '@/lib/activity'
import styles from './UploadPanel.module.css'

export type Parsed = { fileName: string; headers: string[]; rows: SheetRow[] }

const NONE = '__none__'

// Tela de mapeamento de colunas + preview + importação (origem: arquivo ou Drive)
export default function SheetImporter({ parsed, onCancel, onImported }: {
  parsed: Parsed
  onCancel: () => void
  onImported: (count: number) => void
}) {
  const [map, setMap] = useState({ name: '', email: '', phone: '' })
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const g = guessMapping(parsed.headers)
    setMap({ name: g.name ?? '', email: g.email ?? '', phone: g.phone ?? '' })
  }, [parsed])

  async function doImport() {
    setImporting(true)
    setError(null)
    try {
      const leads = rowsToLeads(parsed.rows, map, parsed.fileName.replace(/\.[^.]+$/, ''))
        .map(l => ({ ...l, source: 'planilha' }))
      for (let i = 0; i < leads.length; i += 500) {
        const { error } = await supabase.from('leads').insert(leads.slice(i, i + 500))
        if (error) throw error
      }
      await logActivity(`importou a planilha "${parsed.fileName}" (${leads.length} leads)`)
      onImported(leads.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao importar.')
    } finally {
      setImporting(false)
    }
  }

  const preview = parsed.rows.slice(0, 3)

  return (
    <div className={styles.card}>
      <div className={styles.fileRow}>
        <div className={styles.fileInfo}>
          <FileSpreadsheet size={18} className={styles.fileIcon} />
          <div>
            <div className={styles.fileName}>{parsed.fileName}</div>
            <div className={styles.fileMeta}>{parsed.rows.length} linhas · {parsed.headers.length} colunas</div>
          </div>
        </div>
        <button className={styles.iconBtn} onClick={onCancel} aria-label="Cancelar"><X size={16} /></button>
      </div>

      <div className={styles.mapGrid}>
        {(['name', 'email', 'phone'] as const).map(field => (
          <label key={field} className={styles.mapField}>
            <span className={styles.mapLabel}>
              {field === 'name' ? 'Coluna do Nome' : field === 'email' ? 'Coluna do E-mail' : 'Coluna do Telefone'}
            </span>
            <select
              className={styles.select}
              value={map[field] || NONE}
              onChange={e => setMap(m => ({ ...m, [field]: e.target.value === NONE ? '' : e.target.value }))}
            >
              <option value={NONE}>— não usar —</option>
              {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div className={styles.previewWrap}>
        <table className={styles.preview}>
          <thead><tr>{parsed.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i}>{parsed.headers.map(h => <td key={h}>{row[h]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        <button className={styles.btnGhost} onClick={onCancel}>Cancelar</button>
        <button className={styles.btnPrimary} onClick={doImport} disabled={importing}>
          {importing
            ? <><Loader2 size={15} className={styles.spin} /> Importando…</>
            : <>Importar {parsed.rows.length} leads</>}
        </button>
      </div>
    </div>
  )
}
