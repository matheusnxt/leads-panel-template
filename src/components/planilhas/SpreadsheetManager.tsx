'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'
import styles from './SpreadsheetManager.module.css'

// Uma planilha é identificada pelo par (origem, nome): o mesmo nome pode
// existir nas duas origens, e renomear ou excluir precisa acertar a certa.
type Sheet = { source: string; name: string; count: number }
const PAGE = 1000

const chave = (s: Sheet) => `${s.source}|${s.name}`

export default function SpreadsheetManager({ refreshKey, onChanged, isAdmin, source = 'planilha', sources }: {
  refreshKey: number
  onChanged: () => void
  isAdmin?: boolean
  source?: string
  /** Origens a listar juntas. Ausente = apenas `source`. */
  sources?: string[]
}) {
  const origens = useMemo(() => sources ?? [source], [sources, source])
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const counts = new Map<string, Sheet>()
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('leads').select('form_name, source').in('source', origens)
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      for (const r of data) {
        const name = r.form_name || 'Sem nome'
        const k = `${r.source}|${name}`
        const atual = counts.get(k)
        if (atual) atual.count++
        else counts.set(k, { source: r.source, name, count: 1 })
      }
      if (data.length < PAGE) break
      from += PAGE
    }
    setSheets([...counts.values()].sort((a, b) => b.count - a.count))
    setLoading(false)
  }, [origens])

  useEffect(() => { load() }, [load, refreshKey])

  async function rename(sheet: Sheet) {
    const name = newName.trim()
    if (!name || name === sheet.name) { setEditing(null); return }
    setBusy(true)
    await supabase.from('leads').update({ form_name: name })
      .eq('source', sheet.source).eq('form_name', sheet.name)
    await logActivity(`renomeou a planilha "${sheet.name}" para "${name}"`)
    setBusy(false); setEditing(null)
    load(); onChanged()
  }

  async function remove(sheet: Sheet) {
    if (!confirm(`Excluir a planilha "${sheet.name}" e seus ${sheet.count} leads? Essa ação não pode ser desfeita.`)) return
    setBusy(true)
    await supabase.from('leads').delete()
      .eq('source', sheet.source).eq('form_name', sheet.name)
    await logActivity(`excluiu a planilha "${sheet.name}" (${sheet.count} leads)`)
    setBusy(false)
    load(); onChanged()
  }

  if (loading) return null
  if (sheets.length === 0) return null

  const total = sheets.reduce((s, x) => s + x.count, 0)
  const varias = origens.length > 1

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>
        Planilhas importadas ({sheets.length}) · {total.toLocaleString('pt-BR')} leads
      </h3>
      <div className={styles.list}>
        {sheets.map(s => (
          <div key={chave(s)} className={styles.row}>
            <FileSpreadsheet size={16} className={styles.icon} />
            {editing === chave(s) ? (
              <>
                <input
                  className={styles.input}
                  value={newName}
                  autoFocus
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') rename(s); if (e.key === 'Escape') setEditing(null) }}
                />
                <button className={styles.iconBtn} disabled={busy} onClick={() => rename(s)} title="Salvar">
                  {busy ? <Loader2 size={15} className={styles.spin} /> : <Check size={15} />}
                </button>
                <button className={styles.iconBtn} onClick={() => setEditing(null)} title="Cancelar"><X size={15} /></button>
              </>
            ) : (
              <>
                <span className={styles.name}>{s.name}</span>
                {varias && <span className={styles.origem}>{s.source === 'upload' ? 'upload' : 'planilha'}</span>}
                <span className={styles.count}>{s.count.toLocaleString('pt-BR')} {s.count === 1 ? 'lead' : 'leads'}</span>
                <button className={styles.iconBtn} onClick={() => { setEditing(chave(s)); setNewName(s.name) }} title="Renomear">
                  <Pencil size={15} />
                </button>
                {isAdmin && (
                  <button className={`${styles.iconBtn} ${styles.del}`} onClick={() => remove(s)} title="Excluir">
                    <Trash2 size={15} />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
