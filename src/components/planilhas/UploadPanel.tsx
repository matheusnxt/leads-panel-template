'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { UploadCloud, Check } from 'lucide-react'
import { cellToString, type SheetRow } from '@/lib/sheets'
import SheetImporter, { type Parsed } from './SheetImporter'
import styles from './UploadPanel.module.css'

export default function UploadPanel({ onImported, source = 'planilha', mapExtras = false }: {
  onImported: () => void
  source?: string
  mapExtras?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setDone(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      // raw:true devolve o valor real da célula (número/data), não o texto
      // formatado do Excel — evita telefones virarem notação científica.
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
      const rows: SheetRow[] = rawRows.map(r => {
        const o: SheetRow = {}
        for (const [k, v] of Object.entries(r)) o[k] = cellToString(v)
        return o
      })
      if (rows.length === 0) { setError('A planilha está vazia.'); return }
      setParsed({ fileName: file.name, headers: Object.keys(rows[0]), rows })
    } catch {
      setError('Não consegui ler esse arquivo. Use .csv, .xlsx ou .xls.')
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  if (parsed) {
    return (
      <SheetImporter
        parsed={parsed}
        source={source}
        mapExtras={mapExtras}
        onCancel={() => setParsed(null)}
        onImported={(n) => { setParsed(null); setDone(n); onImported() }}
      />
    )
  }

  return (
    <div className={styles.card}>
      <div
        className={`${styles.dropzone} ${dragOver ? styles.dropOver : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className={styles.dropIcon}><UploadCloud size={26} strokeWidth={1.5} /></div>
        <div className={styles.dropTitle}>Arraste sua planilha aqui</div>
        <div className={styles.dropHint}>ou clique para selecionar · .csv, .xlsx ou .xls</div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
      </div>

      {done !== null && (
        <div className={styles.success}><Check size={16} /> {done} leads importados com sucesso!</div>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
